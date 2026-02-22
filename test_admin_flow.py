#!/usr/bin/env python3
"""
Test Script: Admin-Only Login Flow
Tests the complete admin authentication and dashboard flow.
"""

import requests
import json
import base64
import sys

BASE_URL = "http://127.0.0.1:8000"
FRONTEND_URL = "http://localhost:8003"

def decode_jwt_role(token):
    """Decode JWT and extract role claim."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        # Add padding if needed
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += "=" * padding
        decoded = base64.urlsafe_b64decode(payload)
        data = json.loads(decoded)
        return data.get("role")
    except Exception as e:
        print(f"Error decoding JWT: {e}")
        return None

def test_register_user(email, password, full_name="Test User"):
    """Register a new user."""
    print(f"\n📝 Registering user: {email}")
    response = requests.post(
        f"{BASE_URL}/register",
        json={"email": email, "password": password, "full_name": full_name}
    )
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Registration successful")
        return data
    else:
        print(f"❌ Registration failed: {response.status_code} - {response.text}")
        return None

def test_login(email, password):
    """Login user."""
    print(f"\n🔑 Logging in: {email}")
    response = requests.post(
        f"{BASE_URL}/login",
        json={"email": email, "password": password}
    )
    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        role = decode_jwt_role(token)
        print(f"✅ Login successful")
        print(f"   Token: {token[:20]}...")
        print(f"   Role: {role}")
        return data
    else:
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return None

def test_promote_user(email, admin_token):
    """Promote user to admin role."""
    print(f"\n⭐ Promoting user to admin: {email}")
    response = requests.post(
        f"{BASE_URL}/admin/promote",
        json={"email": email},
        headers={"X-Admin-Token": admin_token}
    )
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Promotion successful")
        return data
    else:
        print(f"❌ Promotion failed: {response.status_code} - {response.text}")
        return None

def test_admin_users(token):
    """Fetch all users (admin endpoint)."""
    print(f"\n👥 Fetching all users (admin endpoint)")
    response = requests.get(
        f"{BASE_URL}/admin/users",
        headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Fetched {len(data)} users")
        for user in data:
            print(f"   - ID {user['id']}: {user['email']} (role: {user['role']})")
        return data
    else:
        print(f"❌ Failed to fetch users: {response.status_code} - {response.text}")
        return None

def test_admin_detections(token):
    """Fetch all detections (admin endpoint)."""
    print(f"\n🔍 Fetching all detections (admin endpoint)")
    response = requests.get(
        f"{BASE_URL}/admin/all-detections",
        headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Fetched {len(data)} detections")
        for detection in data[:5]:  # Show first 5
            print(f"   - ID {detection['id']}: {detection['disease']} ({detection['confidence']:.1f}%)")
        return data
    else:
        print(f"❌ Failed to fetch detections: {response.status_code} - {response.text}")
        return None

def test_non_admin_access(email, password):
    """Test that non-admin users cannot access admin endpoints."""
    print(f"\n🚫 Testing non-admin access rejection: {email}")
    
    # Login as non-admin
    login_data = test_login(email, password)
    if not login_data:
        print("❌ Could not login test user")
        return
    
    token = login_data.get("access_token")
    role = decode_jwt_role(token)
    
    if role == "admin":
        print("❌ Test user should not be admin")
        return
    
    # Try to access admin endpoint
    response = requests.get(
        f"{BASE_URL}/admin/users",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if response.status_code == 401:
        print(f"✅ Non-admin correctly rejected (401)")
    else:
        print(f"❌ Security issue: non-admin got {response.status_code}")

def main():
    """Run all tests."""
    print("=" * 60)
    print("RiceGuard AI - Admin Flow Tests")
    print("=" * 60)
    
    # Admin token from .env
    ADMIN_TOKEN = "secretadmin123"
    
    # Test data with timestamp for uniqueness
    import time
    ts = int(time.time())
    admin_email = f"admin{ts}@riceguard.test"
    admin_password = "AdminTest1234"
    user_email = f"user{ts}@riceguard.test"
    user_password = "UserTest1234"
    
    # Test 1: Register admin user
    print("\n[TEST 1] Register Admin User")
    admin_data = test_register_user(admin_email, admin_password, "Admin User")
    if not admin_data:
        print("❌ Test 1 failed")
        return False
    
    # Test 2: Promote to admin
    print("\n[TEST 2] Promote Admin User")
    promote_data = test_promote_user(admin_email, ADMIN_TOKEN)
    if not promote_data:
        print("❌ Test 2 failed")
        return False
    
    # Test 3: Login as admin
    print("\n[TEST 3] Login as Admin")
    admin_login = test_login(admin_email, admin_password)
    if not admin_login:
        print("❌ Test 3 failed")
        return False
    
    admin_token = admin_login.get("access_token")
    admin_role = decode_jwt_role(admin_token)
    
    if admin_role != "admin":
        print(f"❌ Admin role not in JWT: {admin_role}")
        return False
    
    # Test 4: Access admin endpoints
    print("\n[TEST 4] Access Admin Endpoints")
    users = test_admin_users(admin_token)
    detections = test_admin_detections(admin_token)
    
    if users is None or detections is None:
        print("❌ Test 4 failed")
        return False
    
    # Test 5: Register non-admin user
    print("\n[TEST 5] Register Non-Admin User")
    user_data = test_register_user(user_email, user_password, "Test User")
    if not user_data:
        print("❌ Test 5 failed")
        return False
    
    # Test 6: Non-admin cannot access admin endpoints
    print("\n[TEST 6] Non-Admin Access Rejection")
    test_non_admin_access(user_email, user_password)
    
    # Summary
    print("\n" + "=" * 60)
    print("✅ All tests completed successfully!")
    print("=" * 60)
    print("\nAdmin Flow Summary:")
    print(f"  • Admin user registered: {admin_email}")
    print(f"  • Admin role: {admin_role}")
    print(f"  • Total users in DB: {len(users) if users else 0}")
    print(f"  • Total detections in DB: {len(detections) if detections else 0}")
    print("\nFrontend URLs:")
    print(f"  • Admin login: {FRONTEND_URL}/admin-login.html")
    print(f"  • Admin dashboard: {FRONTEND_URL}/admin.html")
    print(f"  • Normal login: {FRONTEND_URL}/login.html")
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
