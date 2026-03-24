
import jwt
import platform
import subprocess
import hashlib
import os
from datetime import datetime, timezone

class LicenseVerifier:
    def __init__(self, public_key_pem: bytes):
        """
        Args:
            public_key_pem (bytes): RSA Public Key used to verify the license signature.
        """
        self.public_key = public_key_pem

    def get_machine_id(self) -> str:
        """
        Generates a unique hardware fingerprint for the current machine.
        Uses Board Serial Number (Mac/Linux) or UUID.
        """
        system = platform.system()
        try:
            if system == 'Darwin':
                # macOS: extracting IOPlatformSerialNumber
                cmd = "ioreg -l | grep IOPlatformSerialNumber"
                output = subprocess.check_output(cmd, shell=True).decode()
                serial = output.split('=')[1].strip().replace('"', '')
                return hashlib.sha256(serial.encode()).hexdigest()
            elif system == 'Windows':
                cmd = "wmic csproduct get uuid"
                output = subprocess.check_output(cmd, shell=True).decode()
                uuid = output.split('\n')[1].strip()
                return hashlib.sha256(uuid.encode()).hexdigest()
            else:
                # Fallback for Linux or others
                # Use /etc/machine-id if available
                if os.path.exists('/etc/machine-id'):
                     with open('/etc/machine-id', 'r') as f:
                         return f.read().strip()
                return "GENERIC_LINUX_ID"
        except Exception as e:
            print(f"HWID Gen Error: {e}")
            return "UNKNOWN_HWID"

    def verify_license(self, token: str) -> dict:
        """
        Verifies the license token.
        
        Checks:
        1. Signature (Integrity).
        2. Expiration Date.
        3. Machine ID (if 'hw_binding': True in claims).
        
        Returns:
            dict: The license claims if valid.
            
        Raises:
            jwt.ExpiredSignatureError: If expired.
            jwt.InvalidTokenError: If invalid signature or malformed.
            ValueError: If HWID mismatch.
        """
        try:
            claims = jwt.decode(token, self.public_key, algorithms=["RS256"])
            
            # Hardware Binding Check
            if claims.get('hw_binding', False):
                current_hwid = self.get_machine_id()
                license_hwid = claims.get('hw_id')
                if current_hwid != license_hwid:
                    raise ValueError(f"Hardware Mismatch. License bound to different machine.")

            return claims
            
        except jwt.ExpiredSignatureError:
            raise jwt.ExpiredSignatureError("License has expired.")
        except jwt.InvalidTokenError as e:
            raise jwt.InvalidTokenError(f"Invalid License: {str(e)}")
