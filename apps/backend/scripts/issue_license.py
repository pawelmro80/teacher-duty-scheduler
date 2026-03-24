
import jwt
import datetime
import sys
import os

# Load Private Key
PRIVATE_KEY_PATH = "vendor_private_key.pem"

def load_private_key():
    if not os.path.exists(PRIVATE_KEY_PATH):
        print(f"ERROR: '{PRIVATE_KEY_PATH}' not found. Run generate_keys.py first.")
        sys.exit(1)
    with open(PRIVATE_KEY_PATH, "rb") as f:
        return f.read()

def generate_license(school_name, days_valid, hw_id=None):
    private_key = load_private_key()
    
    expiration = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=days_valid)
    
    payload = {
        "school_name": school_name,
        "exp": expiration,
        "iat": datetime.datetime.now(datetime.timezone.utc),
        "hw_binding": False
    }
    
    if hw_id:
        payload["hw_binding"] = True
        payload["hw_id"] = hw_id
        print(f"Binding license to HWID: {hw_id}")

    token = jwt.encode(payload, private_key, algorithm="RS256")
    
    # Save to file
    filename = f"license_{school_name.replace(' ', '_')}.key"
    with open(filename, "w") as f:
        f.write(token)
        
    print(f"\nSUCCESS: License generated for '{school_name}'")
    print(f"Valid until: {expiration}")
    print(f"File: {filename}")
    print("\n--- CONTENT ---")
    print(token)
    print("----------------")

if __name__ == "__main__":
    print("--- LICENSE GENERATOR ---")
    if len(sys.argv) < 3:
        print("Usage: python issue_license.py <School_Name> <Days_Valid> [Optional_HWID]")
        sys.exit(1)
        
    s_name = sys.argv[1]
    days = int(sys.argv[2])
    h_id = sys.argv[3] if len(sys.argv) > 3 else None
    
    generate_license(s_name, days, h_id)
