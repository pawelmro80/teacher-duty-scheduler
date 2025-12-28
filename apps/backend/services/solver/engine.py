
from ortools.sat.python import cp_model
from sqlalchemy.orm import Session
from database import TeacherScheduleDB, DutyConfigDB
import json

class DutySolver:
    """
    Core Optimization Engine for Teacher Duty Scheduling.
    
    Uses Google OR-Tools (CP-SAT) to generate optimal duty assignments based on:
    1. Hard Constraints (Availability, Max Duties, Pinned Assignments).
    2. Soft Constraints (Fairness, Location Proximity, Topology).
    
    Attributes:
        db (Session): Database session.
        model (CpModel): OR-Tools constraint programming model.
        solver (CpSolver): OR-Tools solver instance.
        config (dict): Cached configuration (zones, breaks, rules).
    """
    def __init__(self, db: Session):
        self.db = db
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        
        # Load Data
        self.teachers = self._get_verified_teachers()
        self.config = self._get_config()
        
        # Mappings
        self.zones = self.config.get('zones', [])
        self.breaks = self.config.get('breaks', []) # e.g. [{id: 'b1', afterLesson: 1}, ...]
        self.reqs = self.config.get('requirements', {}) # {zoneId: {breakId: count}}
        self.days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

    def _get_verified_teachers(self):
        return self.db.query(TeacherScheduleDB).filter(TeacherScheduleDB.is_verified == True).all()

    def _get_config(self):
        cfg = self.db.query(DutyConfigDB).filter(DutyConfigDB.key == 'duty_rules').first()
        return cfg.value_json if cfg else {}

    def _is_teacher_available(self, teacher, day, break_info):
        """
        Determines if a teacher is physically available for a duty during a specific break.
        
        Logic:
        - A teacher is available if they have a lesson immediately BEFORE the break (Finishing).
        - OR if they have a lesson immediately AFTER the break (Starting).
        - Prevents assigning duties to teachers who are not in school at that time.
        
        Args:
            teacher (TeacherScheduleDB): Teacher object.
            day (str): Day of week (e.g., 'Mon').
            break_info (dict): Break configuration containing 'afterLesson'.
            
        Returns:
            bool: True if available, False otherwise.
        """
        # Algorithm: Teacher is available for break after lesson N if:
        # 1. They have lesson N (just finished)
        # OR
        # 2. They have lesson N+1 (about to start)
        
        after_lesson_idx = break_info['afterLesson']
        
        has_lesson_before = False
        has_lesson_after = False
        
        for slot in teacher.schedule_json:
            if slot['day'] != day: continue
            
            # Check lesson index match
            # Note: slot['lesson_index'] might be int or string, safe cast needed
            idx = int(slot['lesson_index'])
            
            if idx == after_lesson_idx:
                has_lesson_before = True
            
            if idx == after_lesson_idx + 1:
                has_lesson_after = True
                
        # Policy: Must be present. (Relax this later if needed)
        return has_lesson_before or has_lesson_after

    def _get_location_weight(self, teacher, day, break_info, zone_id):
        """
        Calculates the suitability score (Weight) for assigning a teacher to a specific zone.
        Higher score = Better match.
        
        Factors:
        1. Preferred Zones: Teacher's explicit preference (Max Priority).
        2. Proximity: Is the teacher teaching in a room near this zone?
           - Uses Topology Map (Zone -> Rooms).
           - Uses Proximity Map (Zone -> Neighbor Zones).
           
        Args:
            teacher: Teacher object.
            day: Current day.
            break_info: Break metadata.
            zone_id: ID of the zone being scored.
            
        Returns:
            int: Compatibility score (0-2000).
        """
        # --- TOPOLOGY MAP (Dynamic from Config) ---
        # Maps Zone ID to associated Room Codes
        zone_rooms = self.config.get('topology', {})
        
        # --- PREFERENCE CHECK ---
        # If teacher prefers this zone, give MAX priority immediately.
        prefs = getattr(teacher, 'preferences_json', {}) or {}
        preferred_zones = prefs.get('preferred_zones', [])
        
        if zone_id in preferred_zones:
             return 2000 # BOOST! (Overrides Fairness ~500)
        
        # Neighbor Priority: S_Target -> [Preferred Sources]
        neighbors = self.config.get('proximity', {})

        # Find where the teacher is right BEFORE or AFTER this break
        # (Prioritize BEFORE as that's where they are coming from)
        current_rooms = []
        after_lesson_idx = break_info['afterLesson']
        
        for slot in teacher.schedule_json:
            if slot['day'] != day: continue
            idx = int(slot['lesson_index'])
            room = str(slot.get('room_code', '')).strip().upper()
            
            if not room: continue

            # If lesson just finished (idx == after_lesson) -> Primary location
            if idx == after_lesson_idx:
                current_rooms.append(room)
            # If lesson about to start (idx == after_lesson + 1) -> Secondary location
            # (We could add this to reduce walking Distance to next lesson too)
            elif idx == after_lesson_idx + 1:
                current_rooms.append(room)

        # Calculate Score
        # Match current_rooms against zone_rooms
        
        # We need to map the internal UUID zone_id to the Topology Keys (S1..S7)
        # This is a bit tricky since user defines dynamic names in UI "New Zone".
        # FOR MVP: We try to fuzzy match the Zone Name from Config to keys
        # If no match found, standard weight.
        
        target_name = next((z['name'] for z in self.zones if z['id'] == zone_id), "").upper()
        
        topology_key = None
        if "BOISKO" in target_name: topology_key = 'S1'
        elif "GIMN" in target_name: topology_key = 'S2'
        elif "41" in target_name or "42" in target_name: topology_key = 'S3'
        elif "PIWNICA" in target_name or "SZATNI" in target_name: topology_key = 'S4'
        elif "13" in target_name or "14" in target_name: topology_key = 'S5'
        elif "I PI" in target_name or "1. PI" in target_name: topology_key = 'S6'
        elif "II PI" in target_name or "2. PI" in target_name: topology_key = 'S7'
        
        if not topology_key:
            return 50 # NEUTRAL weight if zone unrecognized (was 10)

        # If teacher has NO room info for this slot -> Neutral
        if not current_rooms:
            return 50

        max_score = 10 # Default if known location but far away
        
        for room in current_rooms:
            # 1. PERFECT MATCH
            if room in zone_rooms.get(topology_key, []):
                return 100 
            
            # 2. NEIGHBOR MATCH
            allowed_neighbors = neighbors.get(topology_key, [])
            for n_key in allowed_neighbors:
                 if room in zone_rooms.get(n_key, []):
                     idx = allowed_neighbors.index(n_key)
                     score = 80 - (idx * 15)
                     max_score = max(max_score, score)

        return max_score

    def _is_blocked_by_double_lesson(self, teacher, day, break_info):
        # Checks if the break is inside a "Block" (Double Lesson with same class)
        after_idx = break_info['afterLesson']
        
        lesson_before = None
        lesson_after = None
        
        for slot in teacher.schedule_json:
            if slot['day'] != day: continue
            idx = int(slot['lesson_index'])
            
            if idx == after_idx:
                lesson_before = slot
            elif idx == after_idx + 1:
                lesson_after = slot
        
        if lesson_before and lesson_after:
            # Check similarity. Assuming 'subject_code' + 'group_code' identifies the class context
            # Or plain text 'group_code' (e.g. 4A)
            cls_before = lesson_before.get('group_code', '')
            cls_after = lesson_after.get('group_code', '')
            
            # If classes match and are not empty, it's a block
            if cls_before and cls_after and cls_before == cls_after:
                return True
                
        return False


    def _is_pinned(self, t_code, day, b_id, z_id, pinned_list, z_map, b_map):
        """Exact match check using maps."""
        if not pinned_list: return False
        for pin in pinned_list:
            if pin.get('teacher_code') == t_code and pin.get('day') == day:
                # Check zone: support both ID and Name
                pin_z_id = pin.get('zone_id')
                if pin_z_id is None and pin.get('zone_name'):
                    pin_z_id = z_map.get(pin.get('zone_name'))
                
                if str(pin_z_id) == str(z_id):
                    # Check break
                    # break_index in pin is mostly int, but key is int. Safe compare.
                    pin_b_idx = pin.get('break_index')
                    if pin_b_idx is not None and b_map.get(int(pin_b_idx)) == b_id:
                        return True
        return False

    def solve(self, pinned_assignments=None):
        """
        Main execution method for generating the schedule.
        
        Process:
        1. Prepares lookup maps (Zone Names -> IDs).
        2. Calculates supply/demand for Fair Load distribution.
        3. Configures dynamic weights based on Slider (Balance).
        4. Initializes OR-Tools Model and Variables.
        5. Applies Constraints (Hard & Soft).
        6. Solves the model and extracts results.
        
        Args:
            pinned_assignments (list): List of manual duties to enforce.
            
        Returns:
            dict: Result object containing 'assignments', 'stats', or 'status' on failure.
        """
        if not self.teachers or not self.zones or not self.breaks:
            return {"status": "error", "message": "Missing data (teachers/config)"}

        # --- PREPARE LOOKUP MAPS ---
        # Needed to map frontend names (Monday, Boisko, Index 0) to solver IDs
        zone_name_to_id = {z['name']: z['id'] for z in self.zones}
        # Assuming break list is sorted by index/time logic or has an index field.
        # FIX: Map 'afterLesson' (which is sent as break_index in result) to ID
        break_index_to_id = {}
        for b in self.breaks:
            try:
                # afterLesson might be int or str
                idx = int(b.get('afterLesson', -1))
                if idx != -1:
                    break_index_to_id[idx] = b['id']
            except:
                pass

        # --- PRE-CALCULATION FOR FAIRNESS ---
        # 1. Calculate Total Supply needed (Total Duty Slots)
        total_slots_needed = 0
        for d in self.days:
            for b in self.breaks:
                for z in self.zones:
                    total_slots_needed += int(self.reqs.get(z['id'], {}).get(b['id'], 0))

        # 2. Calculate Total Teaching Hours (Load)
        teacher_load = {}
        total_teaching_hours = 0
        for t in self.teachers:
            # Count unique lessons
            # FIX: Filter just like in API (ignore empty subjects)
            # (Simple count of list items, assuming flattened list)
            if hasattr(t, 'schedule_json') and t.schedule_json:
                 hours = len([s for s in t.schedule_json if s.get('subject')])
            else:
                 hours = 0
            
            teacher_load[t.teacher_code] = hours
            total_teaching_hours += hours

        # 3. Calculate Target Duties per Teacher
        # Formula: (TeacherHours / TotalHours) * TotalNeeded
        teacher_targets = {}
        if total_teaching_hours > 0:
            for t in self.teachers:
                share = teacher_load[t.teacher_code] / total_teaching_hours
                target = round(share * total_slots_needed)
                teacher_targets[t.teacher_code] = target
        else:
             for t in self.teachers: teacher_targets[t.teacher_code] = 0

        # --- DYNAMIC WEIGHTS CONFIG ---
        balance = int(self.config.get('rules', {}).get('fairness_priority', 50))
        
        if balance <= 50:
            # RANGE 0-50 (Priority: Location)
            # Weight: 5 to 50
            # Edge Penalty: Standard (10)
            FAIRNESS_WEIGHT = int(5 + (balance * 0.9))
            EDGE_PENALTY_WEIGHT = 10
        else:
            # RANGE 50-100 (Priority: Fairness)
            # Weight: 50 to 500
            # Edge Penalty: High (10 -> 50)
            FAIRNESS_WEIGHT = int(50 + ((balance - 50) * 9))
            EDGE_PENALTY_WEIGHT = int(10 + ((balance - 50) * 0.8)) # max 50

        # Prepare PINNED WHITELIST (Teacher, Day, BreakID) -> Force inclusion
        pinned_whitelist = set()
        if pinned_assignments:
            for pin in pinned_assignments:
                t_c = pin.get('teacher_code')
                day = pin.get('day')
                b_idx = pin.get('break_index')
                
                # Robust ID resolution
                b_id = None
                try:
                    if b_idx is not None:
                         b_idx_int = int(b_idx)
                         b_id = break_index_to_id.get(b_idx_int)
                except:
                     pass

                if t_c and day and b_id:
                     pinned_whitelist.add((t_c, day, b_id))

        # --- MODEL VARS ---
        shifts = {} # (teacher, day, break, zone) -> BoolVar
        objective_terms = []
        
        for t in self.teachers:
            for d in self.days:
                for b in self.breaks:
                    
                    is_pinned_slot = (t.teacher_code, d, b['id']) in pinned_whitelist

                    # HARD CONSTRAINT: Availability
                    # If pinned, we IGNORE availability (User overrides logic)
                    if not is_pinned_slot and not self._is_teacher_available(t, d, b):
                        continue

                    # HARD CONSTRAINT: Block Lesson
                    if not is_pinned_slot and self._is_blocked_by_double_lesson(t, d, b):
                        continue

                    for z in self.zones:
                        var = self.model.NewBoolVar(f'shift_{t.teacher_code}_{d}_{b["id"]}_{z["id"]}')
                        shifts[(t.teacher_code, d, b['id'], z['id'])] = var
                        
                        # --- SCORING (SOFT OBJECTIVES) ---
                        raw_score = 0
                        
                        # Pinning overrides score (make it huge)
                        if self._is_pinned(t.teacher_code, d, b['id'], z['id'], pinned_assignments, zone_name_to_id, break_index_to_id):
                             raw_score += 10000 
                             # Note: Pins are enforced by constraint, but high score helps validation

                        # 1. Proximity Score (Locations) [0..100]
                        raw_score += self._get_location_weight(t, d, b, z['id'])
                        
                        # 2. Compact Schedule (Sandwich Rule)
                        after_idx = b['afterLesson']
                        has_before = any(int(s['lesson_index']) == after_idx for s in t.schedule_json if s['day'] == d)
                        has_after = any(int(s['lesson_index']) == after_idx + 1 for s in t.schedule_json if s['day'] == d)
                        
                        if has_before and has_after:
                            raw_score += 20 # Bonus for "Sandwich"
                        elif has_before or has_after:
                            raw_score -= EDGE_PENALTY_WEIGHT # Dynamic Penalty

                        # Use raw scores (Proximity Max ~100)
                        # We will control the balance via FAIRNESS_WEIGHT scaling instead
                        objective_terms.append(var * int(raw_score))

        # 1. Pinned Assignments
        if pinned_assignments:
            for pin in pinned_assignments:
                # Resolve IDs
                t_code = pin.get('teacher_code')
                day = pin.get('day')
                b_idx = pin.get('break_index')
                z_name = pin.get('zone_name')
                
                # Robust Index -> ID Resolution
                b_id = None
                try:
                    # Helper to handle string/int mismatch
                     if b_idx is not None:
                         b_idx_int = int(b_idx)
                         b_id = break_index_to_id.get(b_idx_int)
                except:
                     pass

                # Robust Zone Name -> ID Resolution
                z_id = pin.get('zone_id') # First check for direct ID (from DB)
                if z_id is None:
                     # Fallback to name (from Frontend DnD)
                     z_name = pin.get('zone_name')
                     z_id = zone_name_to_id.get(z_name)
                     
                     # Fallback: case insensitive search? or just mismatch
                     if not z_id and z_name:
                          # Try to find matching name case-insensitive
                          z_found = next((z for z in self.zones if z['name'].lower() == str(z_name).lower()), None)
                          if z_found: z_id = z_found['id']

                if t_code and day and b_id and z_id:
                    # Look for the variable
                    var = shifts.get((t_code, day, b_id, z_id))
                    if var is not None:
                        self.model.Add(var == 1)
                        # print(f"DEBUG: Successfully pinned {t_code} to {day} {b_idx} {z_name}")
                    else:
                        print(f"Warning: Pinned assignment variable NOT FOUND: {t_code} {day} {b_idx} {z_name} (Resolved IDs: {b_id}, {z_id})")
                        # This happens if 'availability' or 'block' logic skipped creating the variable.
                        # Should we force-create it? Or imply the pin is invalid?
                        # Solver logic skips creating vars if hard constraints fail (availability).
                        # We should probably relax availability for PINNED slots in creation looop.
                else:
                     print(f"Warning: Failed to resolve IDs for pin: {pin} (b_id:{b_id}, z_id:{z_id})")

        # --- CONSTRAINTS ---

        # 1. Zone Requirements
        for d in self.days:
            for b in self.breaks:
                for z in self.zones:
                    required_count = int(self.reqs.get(z['id'], {}).get(b['id'], 0))
                    
                    potential = [
                        shifts[(t.teacher_code, d, b['id'], z['id'])]
                        for t in self.teachers
                        if (t.teacher_code, d, b['id'], z['id']) in shifts
                    ]
                    
                    # FIX: If requirement is 0 (or missing), FORCE 0 (nobody on duty)
                    # Previously we skipped this, which allowed solver to put everyone there to maximize score.
                    if required_count == 0:
                        if potential:
                            self.model.Add(sum(potential) == 0)
                    else:
                        # Normal requirement logic
                        if len(potential) < required_count:
                            # Not enough people available -> Fill as many as possible
                            self.model.Add(sum(potential) <= len(potential))
                        else:
                            # Exact match
                            self.model.Add(sum(potential) == required_count)

        # 2b. One Place at a Time (GLOBAL TIME CONFLICT)
        # Fixes issue where duplicates of breaks (e.g. 2x "After Lesson 7") allow teachers to be in 2 places.
        # We group breaks by 'afterLesson'.
        breaks_by_time = {}
        for b in self.breaks:
            breaks_by_time.setdefault(b['afterLesson'], []).append(b['id'])

        for t in self.teachers:
            for d in self.days:
                for lesson_idx, b_ids in breaks_by_time.items():
                    # Collect all shifts for this time slot (across all conflicting breaks)
                    concurrent_shifts = []
                    for bid in b_ids:
                        for z in self.zones:
                            if (t.teacher_code, d, bid, z['id']) in shifts:
                                concurrent_shifts.append(shifts[(t.teacher_code, d, bid, z['id'])])
                    
                    if concurrent_shifts:
                        self.model.Add(sum(concurrent_shifts) <= 1)

        # 3. Daily Limit (HARD: Dynamic from Config, default 2)
        max_daily = int(self.config.get('rules', {}).get('max_duties_per_day', 2))
        for t in self.teachers:
            for d in self.days:
                daily_shifts = [shifts[(t.teacher_code, d, b['id'], z['id'])] 
                                for b in self.breaks for z in self.zones 
                                if (t.teacher_code, d, b['id'], z['id']) in shifts]
                if daily_shifts:
                    self.model.Add(sum(daily_shifts) <= max_daily)

        # 4. Long Break Limit (HARD: Dynamic from Config, default 2 per week)
        # Definition: Any break with duration >= 20 mins is considered "Long/Lunch"
        max_long_weekly = int(self.config.get('rules', {}).get('max_long_break_duties', 2))
        
        for t in self.teachers:
            long_break_shifts = []
            for d in self.days:
                for b in self.breaks:
                    # Check duration (fallback to checking name or slot if duration missing, but duration is preferred)
                    duration = int(b.get('duration', 10))
                    if duration >= 20: 
                        for z in self.zones:
                            if (t.teacher_code, d, b['id'], z['id']) in shifts:
                                long_break_shifts.append(shifts[(t.teacher_code, d, b['id'], z['id'])])
            
            if long_break_shifts:
                self.model.Add(sum(long_break_shifts) <= max_long_weekly)

        # 5. Fairness & Burnout Scoring (Handled via Objective)
        # Dynamic Weights based on Slider (0-100)
        # We use a Piecewise Linear function to make the slider effective.
        # Proximity Score is approx 0-100 per assignment.
        # Fairness Penalty is per unit of deviation.
        
        balance = int(self.config.get('rules', {}).get('fairness_priority', 50))
        
        if balance <= 50:
            # RANGE 0-50 (Priority: Location)
            # Weight: 5 to 50
            # Edge Penalty: Standard (10) - we allow edges if location is good
            FAIRNESS_WEIGHT = int(5 + (balance * 0.9))
            EDGE_PENALTY_WEIGHT = 10
        else:
            # RANGE 50-100 (Priority: Fairness)
            # Weight: 50 to 500
            # Edge Penalty: High (10 -> 50) - we hate edges if we want fairness
            # (Because "fair" also means "not wasting my time waiting")
            FAIRNESS_WEIGHT = int(50 + ((balance - 50) * 9))
            EDGE_PENALTY_WEIGHT = int(10 + ((balance - 50) * 0.8)) # Scales up to 50
            
        # PROXIMITY_MAX_SCORE is implicitly 100 (raw scores)
        
        print(f"SOLVER WEIGHTS: Balance={balance}, FairnessPenalty={FAIRNESS_WEIGHT}, EdgePenalty={EDGE_PENALTY_WEIGHT}")

        for t in self.teachers:
            target = teacher_targets.get(t.teacher_code, 0)
            
            # --- PER TEACHER constraints ---
            
            # 1a. Weekly Edge Limit (User Configurable)
            # Replaces hardcoded daily limit.
            max_weekly_edges = int(self.config.get('rules', {}).get('max_weekly_edge_duties', 5))
            
            weekly_edge_vars = []
            
            for d in self.days:
                # daily_edge_vars = [] # Optional: could still limit daily spam, but let's stick to weekly first
                for b in self.breaks:
                    # Check if this break is an edge for this teacher/day
                    after_idx = b['afterLesson']
                    has_before = any(int(s['lesson_index']) == after_idx for s in t.schedule_json if s['day'] == d)
                    has_after = any(int(s['lesson_index']) == after_idx + 1 for s in t.schedule_json if s['day'] == d)
                    
                    is_edge = (has_before or has_after) and not (has_before and has_after)
                    
                    if is_edge:
                        for z in self.zones:
                            if (t.teacher_code, d, b['id'], z['id']) in shifts:
                                weekly_edge_vars.append(shifts[(t.teacher_code, d, b['id'], z['id'])])
            
            if weekly_edge_vars:
               self.model.Add(sum(weekly_edge_vars) <= max_weekly_edges)

            all_shifts = [shifts[(t.teacher_code, d, b['id'], z['id'])] 
                          for d in self.days for b in self.breaks for z in self.zones
                          if (t.teacher_code, d, b['id'], z['id']) in shifts]
            
            if all_shifts:
                # 1. Total Assigned
                total_assigned = self.model.NewIntVar(0, 50, f'total_{t.teacher_code}')
                self.model.Add(sum(all_shifts) == total_assigned)
                
                # 2. Deviation
                deviation = self.model.NewIntVar(0, 50, f'dev_{t.teacher_code}')
                diff = self.model.NewIntVar(-50, 50, f'diff_{t.teacher_code}')
                self.model.Add(diff == total_assigned - target)
                self.model.AddAbsEquality(deviation, diff)
                
                # 3. Penalty (User Configured Weight)
                objective_terms.append(deviation * -FAIRNESS_WEIGHT)
                
                # STRICTER BOUND (User Configured Limit)
                max_dev = int(self.config.get('rules', {}).get('max_fairness_deviation', 2))
                self.model.Add(deviation <= max_dev)

        # --- OBJECTIVE ---
        self.model.Maximize(sum(objective_terms))
        
        # Let's peek at where objective_terms are created.
        # pass # Placeholder logic check

        
        # --- SOLVE ---
        status = self.solver.Solve(self.model)

        if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
            # Extract Results
            result_schedule = []
            
            for (t_code, day, b_id, z_id), var in shifts.items():
                if self.solver.Value(var) == 1:
                    z_name = next((z['name'] for z in self.zones if z['id'] == z_id), z_id)
                    b_obj = next((b for b in self.breaks if b['id'] == b_id), None)
                    b_name = b_obj['name'] if b_obj else b_id
                    b_idx = b_obj['afterLesson'] if b_obj else 999
                    
                    # --- ANALYSIS FOR COLORING ---
                    teacher = next(t for t in self.teachers if t.teacher_code == t_code)
                    
                    logs = []
                    assign_status = "optimal" # green
                    
                    # 1. Check Proximity
                    prox_score = self._get_location_weight(teacher, day, b_obj, z_id)
                    
                    if prox_score <= 20:
                        assign_status = "critical"
                        logs.append("Far location")
                    elif prox_score < 80:
                        if assign_status != "critical": assign_status = "warning"
                        logs.append("Check location")

                    # 2. Check Edge
                    after_idx = b_obj['afterLesson']
                    has_before = any(int(s['lesson_index']) == after_idx for s in teacher.schedule_json if s['day'] == day)
                    has_after = any(int(s['lesson_index']) == after_idx + 1 for s in teacher.schedule_json if s['day'] == day)
                    
                    if not (has_before and has_after):
                        if assign_status != "critical": assign_status = "warning"
                        logs.append("Edge duty")
                    
                    # Check if pinned (echo back to frontend)
                    is_pinned = (t_code, day, b_id) in pinned_whitelist
                    if is_pinned:
                        assign_status = "warning" # Or specific pinned status? Maybe keep it simple.
                        logs.append("Locked by User")

                    result_schedule.append({
                        "teacher_code": t_code,
                        "day": day,
                        "break_id": b_id,
                        "break_name": b_name,
                        "break_index": b_idx,
                        "zone_id": z_id,
                        "zone_name": z_name,
                        "assign_status": assign_status,
                        "assign_logs": logs,
                        "is_pinned": is_pinned,
                        "is_manual": is_pinned # Pinned implies manual intervention usually
                })
        
            # Calculate actual counts from the generated solution
            actual_counts_from_solver = {}
            for assignment in result_schedule:
                tc = assignment.get('teacher_code')
                actual_counts_from_solver[tc] = actual_counts_from_solver.get(tc, 0) + 1

            return {
                "status": "success",
                "stats": {
                    "total_duties": len(result_schedule),
                    "status_str": self.solver.StatusName(status) # "OPTIMAL", "FEASIBLE"
                },
                "solution": result_schedule,
                "teacher_targets": teacher_targets,
                "actual_duties_calculated": actual_counts_from_solver
            }
        else:
            return {
                "status": "failed", 
                "message": "No feasible schedule found. Try reducing requirements."
            }

    def search_candidates(self, day, break_index, zone_name):
        """
        Finds eligible teachers for a specific slot (Interactive Mode).
        Used by the Frontend when a user clicks a cell to manually assign a duty.
        
        Sorting Logic:
        1. Availability (Must be available).
        2. Preference (If they prefer this zone).
        3. Proximity (If they are nearby).
        4. Load Balance (If they are under-assigned).
        
        Args:
            day (str): Day code (e.g. 'Tue').
            break_index (int): Break index (1-based).
            zone_name (str): Display name of the zone.
            
        Returns:
            list: List of candidate objects sorted by suitability score.
        """
        try:
            # Debug incoming
            print(f"Searching candidates for {day}, Break IDX: {break_index}, Zone: {zone_name}")
            
            # Robust Zone Lookup (Case Insensitive + Strip)
            target_zone = next((z for z in self.zones if z['name'].strip().lower() == zone_name.strip().lower()), None)
            
            # Match break by afterLesson (break_index from frontend is afterLesson)
            target_break = next((b for b in self.breaks if int(b.get('afterLesson', -1)) == break_index), None)

            if not target_zone or not target_break:
                 return [{"teacher_code": "ERR", "teacher_name": "Invalid Context", "score": 0, "status": "ERROR", "reason": f"Zone/Break not found. Z={bool(target_zone)} B={bool(target_break)}"}]
                 
            z_id = target_zone['id']
            b_id = target_break['id']
            
            candidates = []
            
            for t in self.teachers:
                score = 50 # Base score
                status = 'OK'
                messages = []
                
                # 1. Availability Check
                if not self._is_teacher_available(t, day, target_break):
                    status = 'BUSY'
                    messages.append("Ma lekcję w tym czasie")
                    score = -100
                    
                # 2. Block Lesson
                elif self._is_blocked_by_double_lesson(t, day, target_break):
                    status = 'WARNING'
                    messages.append("Blok lekcyjny (ta sama klasa)")
                    score -= 50
                    
                if status != 'BUSY':
                    # Calculate Suitability Scores
                    
                    # Proximity
                    loc_w = self._get_location_weight(t, day, target_break, z_id)
                    score += (loc_w - 50) # Normalize around 0 adjustment
                    if loc_w >= 100: messages.append("Idealna lokalizacja")
                    elif loc_w < 50: messages.append("Daleko od sali")
                    
                    # Sandwich Rule
                    after_idx = target_break['afterLesson']
                    has_before = any(int(s['lesson_index']) == after_idx for s in t.schedule_json if s['day'] == day)
                    has_after = any(int(s['lesson_index']) == after_idx + 1 for s in t.schedule_json if s['day'] == day)
                    if has_before and has_after:
                         score += 20
                         messages.append("Okienko (Sandwich)")
                    
                candidates.append({
                    "teacher_code": t.teacher_code,
                    "teacher_name": t.teacher_name, # Use DB column directly
                    "score": score,
                    "status": status,
                    "reason": ", ".join(messages)
                })
            
            candidates.sort(key=lambda x: (-x['score'], x['teacher_name']))
            return candidates

        except Exception as e:
            import traceback
            traceback.print_exc()
            return [{"teacher_code": "ERR", "teacher_name": "Crash", "score": 0, "status": "ERROR", "reason": str(e)}]
