import unittest
from unittest.mock import MagicMock
import sys
import os

# Add parent directory to path to import services
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.solver.engine import DutySolver
from database import TeacherScheduleDB

class TestDutySolver(unittest.TestCase):
    
    def setUp(self):
        # Mock DB Session
        self.mock_db = MagicMock()
        self.solver = DutySolver(self.mock_db)
        
        # Base Mock Data
        self.solver.days = ['Mon'] # Test on single day for simplicity
        
        # 1. Config (Zones & Breaks)
        self.solver.zones = [{'id': 'z1', 'name': 'Boisko'}]
        self.solver.breaks = [
            {'id': 'b1', 'name': 'Przerwa 1', 'afterLesson': 4, 'duration': 10}
        ]
        self.solver.reqs = {'z1': {'b1': 1}} # Require 1 person on Boisko

        # 2. Teacher (Standard)
        t1 = MagicMock(spec=TeacherScheduleDB)
        t1.teacher_code = 'T1'
        t1.is_verified = True
        # Schedule: Lesson 4 (Before Break) and Lesson 5 (After Break) -> Available
        t1.schedule_json = [
            {'day': 'Mon', 'lesson_index': 4, 'room_code': '10'},
            {'day': 'Mon', 'lesson_index': 5, 'room_code': '10'}
        ]
        
        self.solver.teachers = [t1]
        
        # Mock _get_config to return empty dict as we inject manually
        self.solver._get_config = MagicMock(return_value={})
        self.solver._get_verified_teachers = MagicMock(return_value=[t1])

    def test_basic_assignment_success(self):
        """Test that single teacher available is assigned to required slot."""
        result = self.solver.solve()
        
        self.assertEqual(result['status'], 'success')
        self.assertEqual(len(result['solution']), 1)
        assignment = result['solution'][0]
        self.assertEqual(assignment['teacher_code'], 'T1')
        self.assertEqual(assignment['zone_id'], 'z1')

    def test_unavailable_teacher(self):
        """Test that teacher NOT present in school is NOT assigned."""
        # Change schedule to be completely different time
        self.solver.teachers[0].schedule_json = [
             {'day': 'Mon', 'lesson_index': 1, 'room_code': '10'} # Lesson 1 (Break is after 4)
        ]
        
        result = self.solver.solve()
        
        # Should fail because no verified teachers available for slot 4
        # Requirement is 1, Available is 0. 
        # Our logic: if potential < required, add(sum(potential) <= len) -> sum <= 0 -> 0 assigned.
        # But wait, if assigned count < required, does solve return success? 
        # Yes, it finds optimal solution (0 assigned).
        
        self.assertEqual(result['status'], 'success')
        self.assertEqual(len(result['solution']), 0) 

    def test_duplicate_time_conflict_impossible(self):
        """
        Safety Check: Verify that if resources are insufficient for concurrent breaks,
        the solver returns FAILED instead of cloning the teacher.
        """
        # Add a SECOND break at the same time
        self.solver.breaks.append(
            {'id': 'b2', 'name': 'Przerwa 1 DUPLICATE', 'afterLesson': 4, 'duration': 10}
        )
        self.solver.reqs['z1']['b2'] = 1
        
        # 1 Teacher, 2 Concurrent Slots. Impossible to satisfy Hard Constraints.
        result = self.solver.solve()
        
        # Expect FAILED (Good! It means it refused to break laws of physics)
        self.assertEqual(result['status'], 'failed')

    def test_duplicate_time_conflict_resolved_with_more_staff(self):
        """
        Logic Check: With enough staff, Solver should handle concurrent breaks correctly.
        """
        # Add a SECOND break at the same time
        self.solver.breaks.append(
            {'id': 'b2', 'name': 'Przerwa 1 DUPLICATE', 'afterLesson': 4, 'duration': 10}
        )
        self.solver.reqs['z1']['b2'] = 1
        
        # Add Teacher 2 (Clone of T1 but different ID)
        t2 = MagicMock(spec=TeacherScheduleDB)
        t2.teacher_code = 'T2'
        t2.is_verified = True
        t2.schedule_json = self.solver.teachers[0].schedule_json
        self.solver.teachers.append(t2)
        
        # Reformulate reqs because appending teachers manually requires refresh for 'potential' list logic? 
        # No, solver reads self.teachers directly.
        
        result = self.solver.solve()
        
        self.assertEqual(result['status'], 'success')
        
        assignments = result['solution']
        self.assertEqual(len(assignments), 2) # Both slots filled
        
        # Verify unique assignment
        assigned_teachers = [a['teacher_code'] for a in assignments]
        self.assertIn('T1', assigned_teachers)
        self.assertIn('T2', assigned_teachers)
        self.assertNotEqual(assignments[0]['break_id'], assignments[1]['break_id'])

    def test_double_lesson_block_logic(self):
        """Test that teacher having double lesson (Block) is skipped."""
        # Setup Block Lesson: 4A Math at 4, 4A Math at 5. Break is after 4.
        self.solver.teachers[0].schedule_json = [
            {'day': 'Mon', 'lesson_index': 4, 'room_code': '10', 'group_code': '4A'},
            {'day': 'Mon', 'lesson_index': 5, 'room_code': '10', 'group_code': '4A'}
        ]
        
        result = self.solver.solve()
        
        # Should be 0 assignments because blocked
        self.assertEqual(len(result['solution']), 0)

if __name__ == '__main__':
    unittest.main()
