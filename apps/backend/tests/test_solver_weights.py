import pytest
from services.solver.engine import DutySolver
from ortools.sat.python import cp_model

# Mocks
class MockTeacher:
    def __init__(self, code, schedule):
        self.teacher_code = code
        self.teacher_name = code
        self.schedule_json = schedule

class TestableDutySolver(DutySolver):
    def __init__(self, teachers, context, config_rules):
        # Skip parent init
        self.model = cp_model.CpModel()
        self.solver = cp_model.CpSolver()
        self.teachers = teachers
        
        # Combine context (zones/breaks) and rules into 'self.config'
        self.config = context.copy()
        self.config.update(config_rules)
        
        self.zones = self.config.get('zones', [])
        self.breaks = self.config.get('breaks', [])
        self.reqs = self.config.get('requirements', {})
        self.days = context.get('days', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])

@pytest.fixture
def mock_teachers():
    # Teacher A: Heavily loaded (should get more duties) - Works all week
    sch_a = []
    for d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']:
        sch_a.extend([{'day': d, 'lesson_index': i, 'subject': 'Math'} for i in range(1, 8)])
        
    # Teacher B: Lightly loaded - Works only Monday
    sch_b = [{'day': 'Mon', 'lesson_index': 1, 'subject': 'Art'}] 
    return [MockTeacher('TA', sch_a), MockTeacher('TB', sch_b)]

@pytest.fixture
def mock_config_rules():
    return {
        'rules': {
            'max_duties_per_day': 5,
            'max_long_break_duties': 5,
            'max_fairness_deviation': 2,
            'fairness_priority': 50 # Default
        }
    }

@pytest.fixture
def mock_reqs():
    # 1 Zone, 1 Break
    return {'z1': {'b1': 1}}

@pytest.fixture
def mock_context(mock_reqs):
    return {
        'days': ['Mon'],
        'breaks': [{'id': 'b1', 'name': 'Break 1', 'afterLesson': 1, 'duration': 10}],
        'zones': [{'id': 'z1', 'name': 'Zone 1'}],
        'requirements': mock_reqs
    }

def test_solver_weights_balance_50(mock_teachers, mock_context, mock_config_rules):
    """Test solver runs with default balance (50)"""
    mock_config_rules['rules']['fairness_priority'] = 50
    solver = TestableDutySolver(mock_teachers, mock_context, mock_config_rules)
    
    result = solver.solve()
    assert result['status'] == 'success'

def test_solver_weights_proximity_priority(mock_teachers, mock_context, mock_config_rules):
    """Test solver runs with max proximity priority (0)"""
    mock_config_rules['rules']['fairness_priority'] = 0
    solver = TestableDutySolver(mock_teachers, mock_context, mock_config_rules)
    
    result = solver.solve()
    assert result['status'] == 'success'

def test_solver_weights_fairness_priority(mock_teachers, mock_context, mock_config_rules):
    """Test solver runs with max fairness priority (100)"""
    mock_config_rules['rules']['fairness_priority'] = 100
    solver = TestableDutySolver(mock_teachers, mock_context, mock_config_rules)
    
    result = solver.solve()
    assert result['status'] == 'success'

def test_solver_respects_deviation_limit(mock_teachers, mock_context, mock_config_rules):
    """Verification that deviation constraint is respected"""
    # 5 Days
    mock_context['days'] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    
    # Set strict deviation limit (1 is realistic, 0 is often infeasible)
    mock_config_rules['rules']['max_fairness_deviation'] = 1
    
    solver = TestableDutySolver(mock_teachers, mock_context, mock_config_rules)
    result = solver.solve()
    
    assert result['status'] == 'success'
    counts = result['actual_duties_calculated']
    targets = result['teacher_targets']
    
    print(f"Targets: {targets}")
    print(f"Actuals: {counts}")
    
    # Assert deviation is within limit
    for t_code, target in targets.items():
        actual = counts.get(t_code, 0)
        assert abs(actual - target) <= 1
