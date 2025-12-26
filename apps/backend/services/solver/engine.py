
from ortools.sat.python import cp_model
from sqlalchemy.orm import Session
from database import TeacherScheduleDB, DutyConfigDB
import json

class DutySolver:
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
        # --- TOPOLOGY MAP (Based on User Input) ---
        # Maps Zone ID (e.g. 'z1') to associated Room Codes
        # Note: In real app, these IDs should match DB. For now I map heuristic names.
        
        # Heuristic mapping normalized to lowercase
        zone_rooms = {
            'S1': ['14', '15', '13', '12', '3'],          # Boisko
            'S2': ['10', '11', '12', 'MSG', 'DSG'],       # Parter Gimn
            'S3': ['41', '42'],                           # Parter 41-42
            'S4': ['3', '14', '15', '13', '12'],          # Piwnica
            'S5': ['12', '13', '14', '15'],               # Parter 13-14
            'S6': ['21', '22', '23', '24', '25', '26', '27', '28'], # I Pietro
            'S7': ['30', '31', '32', '33', '34', '35', '36', '37', '38'] # II Pietro
        }
        
        # Neighbor Priority: S_Target -> [Preferred Sources]
        neighbors = {
            'S1': ['S5', 'S2', 'S6'],
            'S2': ['S5', 'S3', 'S6'],
            'S3': ['S2', 'S5', 'S6'],
            'S4': ['S5', 'S2', 'S6'],
            'S5': ['S2', 'S6', 'S7'],
            'S6': ['S7', 'S5', 'S4'],
            'S7': ['S6', 'S5', 'S2']
        }

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

    def solve(self):
        if not self.teachers or not self.zones or not self.breaks:
            return {"status": "error", "message": "Missing data (teachers/config)"}

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
            # (Simple count of list items, assuming flattened list)
            hours = len(t.schedule_json)
            teacher_load[t.teacher_code] = hours
            total_teaching_hours += hours

        # 3. Calculate Target Duties per Teacher
        # Formula: (TeacherHours / TotalHours) * TotalNeeded
        teacher_targets = {}
        if total_teaching_hours > 0:
            for t in self.teachers:
                share = teacher_load[t.teacher_code] / total_teaching_hours
                target = round(share * total_slots_needed)
                # Ensure minimum 1 if they teach? Or allow 0.
                teacher_targets[t.teacher_code] = target
        else:
            # Fallback uniform
            for t in self.teachers: teacher_targets[t.teacher_code] = 0

        # --- MODEL VARS ---
        shifts = {} # (teacher, day, break, zone) -> BoolVar
        objective_terms = []
        
        for t in self.teachers:
            for d in self.days:
                for b in self.breaks:
                    
                    # HARD CONSTRAINT: Availability
                    if not self._is_teacher_available(t, d, b):
                        continue

                    # HARD CONSTRAINT: Block Lesson
                    if self._is_blocked_by_double_lesson(t, d, b):
                        continue

                    for z in self.zones:
                        var = self.model.NewBoolVar(f'shift_{t.teacher_code}_{d}_{b["id"]}_{z["id"]}')
                        shifts[(t.teacher_code, d, b['id'], z['id'])] = var
                        
                        # --- SCORING (SOFT OBJECTIVES) ---
                        score = 0
                        
                        # 1. Proximity Score (Locations) [0..100]
                        score += self._get_location_weight(t, d, b, z['id'])
                        
                        # 2. Compact Schedule (Sandwich Rule)
                        # Check availability context again for score
                        after_idx = b['afterLesson']
                        has_before = any(int(s['lesson_index']) == after_idx for s in t.schedule_json if s['day'] == d)
                        has_after = any(int(s['lesson_index']) == after_idx + 1 for s in t.schedule_json if s['day'] == d)
                        
                        if has_before and has_after:
                            score += 20 # Bonus for "Sandwich" (convenient)
                        elif has_before or has_after:
                            score -= 10 # Penalty for "Edge" (staying late or coming early just for duty)

                        objective_terms.append(var * int(score))

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

        # 5. Fairness & Burnout Scoring (Handled via Objective + Soft Limits)
        for t in self.teachers:
            target = teacher_targets.get(t.teacher_code, 0)
            all_shifts = [shifts[(t.teacher_code, d, b['id'], z['id'])] 
                          for d in self.days for b in self.breaks for z in self.zones
                          if (t.teacher_code, d, b['id'], z['id']) in shifts]
            
            if all_shifts:
                # Flexible Bound: Target +/- 3
                self.model.Add(sum(all_shifts) <= target + 3)

        # --- OBJECTIVE ---
        self.model.Maximize(sum(objective_terms))
        
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

                    result_schedule.append({
                        "teacher_code": t_code,
                        "day": day,
                        "break_id": b_id,
                        "break_name": b_name,
                        "break_index": b_idx,
                        "zone_id": z_id,
                        "zone_name": z_name,
                        "assign_status": assign_status,
                        "assign_logs": logs
                    })
            
            return {
                "status": "success",
                "stats": {
                    "total_duties": len(result_schedule),
                    "status_str": self.solver.StatusName(status)
                },
                "solution": result_schedule
            }
        else:
            return {
                "status": "failed", 
                "message": "No feasible schedule found. Try reducing requirements."
            }
