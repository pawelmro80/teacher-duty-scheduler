import requests
import json
import sys

BASE_URL = "http://127.0.0.1:8765/api"

def run_test():
    print("🧪 STARTING BACKEND INTEGRATION TEST...")

    # 1. Health Check
    try:
        r = requests.get(f"http://127.0.0.1:8765/health")
        if r.status_code == 200:
            print("✅ Backend is UP")
        else:
            print(f"❌ Backend failed health check: {r.status_code}")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Could not connect to backend: {e}")
        sys.exit(1)

    # 2. Save New Schedule (Simulation of initial Upload & Modify)
    teacher_code = "TEST_AUTO"
    payload_v1 = {
        "teacher_code": teacher_code,
        "teacher_name": "Test Teacher V1",
        "schedule": [
            {"day": "Mon", "lesson_index": 1, "group_code": "1A", "room_code": "101", "subject": "Math", "is_empty": False}
        ]
    }
    
    print(f"🔹 Step 1: Saving new teacher {teacher_code}...")
    r = requests.post(f"{BASE_URL}/schedule/save", json=payload_v1)
    if r.status_code == 200:
        print("✅ Save V1 Successful")
    else:
        print(f"❌ Save V1 Failed: {r.text}")
        sys.exit(1)

    # 3. Verify it exists and is verified
    print(f"🔹 Step 2: verifying {teacher_code} stored data...")
    r = requests.get(f"{BASE_URL}/schedule/{teacher_code}")
    data = r.json()
    if data['teacher_name'] == "Test Teacher V1" and data.get('is_verified') == True:
        print("✅ Data V1 verified correct (Name matches, Verified=True)")
    else:
        print(f"❌ Data Verification Failed: {data}")
        sys.exit(1)

    # 4. Overwrite (Simulation of 'Smart Edit' from Database)
    # Frontend sends the SAME teacher_code with NEW data
    payload_v2 = {
        "teacher_code": teacher_code,
        "teacher_name": "Test Teacher V2 (EDITED)", 
        "schedule": [
            {"day": "Mon", "lesson_index": 1, "group_code": "1A", "room_code": "101", "subject": "Math", "is_empty": False},
            {"day": "Tue", "lesson_index": 2, "group_code": "2B", "room_code": "202", "subject": "Physics", "is_empty": False}
        ]
    }
    
    print(f"🔹 Step 3: Overwriting {teacher_code} (Simulating Edit)...")
    r = requests.post(f"{BASE_URL}/schedule/save", json=payload_v2)
    if r.status_code == 200:
        print("✅ Save V2 (Overwrite) Successful")
    else:
        print(f"❌ Save V2 Failed: {r.text}")
        sys.exit(1)

    # 5. Verify Update
    print(f"🔹 Step 4: Verifying update...")
    r = requests.get(f"{BASE_URL}/schedule/{teacher_code}")
    data = r.json()
    if data['teacher_name'] == "Test Teacher V2 (EDITED)" and len(data['schedule']) == 2:
        print("✅ Data V2 verified correct (Name updated, slots count = 2)")
    else:
        print(f"❌ Update Verification Failed: {data}")
        sys.exit(1)

    print("\n🎉 ALL TESTS PASSED! The backend logic for Saving, Verifying, and Updating is SOLID.")

if __name__ == "__main__":
    run_test()
