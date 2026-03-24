
import os
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

def generate_keys():
    """
    Generates a new RSA 2048-bit key pair.
    Saves 'private_key.pem' and 'public_key.pem' to the current directory.
    """
    print("Generating RSA Key Pair...")
    
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048
    )

    # Serialize Private Key
    pem_private = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )

    # Serialize Public Key
    public_key = private_key.public_key()
    pem_public = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )

    # Save to files
    with open("vendor_private_key.pem", "wb") as f:
        f.write(pem_private)
    
    with open("public_key.pem", "wb") as f:
        f.write(pem_public)
        
    print("SUCCESS: Keys generated.")
    print(" - 'vendor_private_key.pem': KEEP SECRET! Use this to sign licenses.")
    print(" - 'public_key.pem': Ship this with your application (backend).")

if __name__ == "__main__":
    generate_keys()
