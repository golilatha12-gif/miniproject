#!/usr/bin/env python3
"""
Test Super Admin Role Management
Tests that only admin123@gmail.com can change user roles
"""

import requests
import json
import base64
import sqlite3

BASE_URL = "http://127.0.0.1:8000"
DB_PATH = r"backend/riceguard.db"

def cleanup_test_users():
    """Clean up test users from database before running tests."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE email IN (?, ?)", 
                      ("admin123@gmail.com", "testuser@example.com"))
        conn.commit()
        conn.close()
        print("✓ Test users cleaned from database")
    except Exception as e:
        print(f"✓ Database cleanup: {e}")

def decode_jwt_role(token):
    """Decode JWT and extract role claim."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += "=" * padding
        decoded = base64.urlsafe_b64decode(payload)
        data = json.loads(decoded)
        return data.get("role")
    except:
        return None

print("=" * 60)
print("Super Admin Role Management Tests")
print("=" * 60)

# Clean up test users before running
cleanup_test_users()

# Test 1: Create super admin user
print("\n[TEST 1] Create super admin account (admin123@gmail.com)")
response = requests.post(
    f"{BASE_URL}/register",
    json={
        "email": "admin123@gmail.com",
        "password": "SuperAdmin1234",
        "full_name": "Super Admin"
    }
)
if response.status_code == 200:
    print("✓ Super admin account created")
else:
    print(f"✗ Failed: {response.status_code}")
    print(f"  Response: {response.text}")

# Test 2: Create regular user
print("\n[TEST 2] Create regular user (testuser@example.com)")
response = requests.post(
    f"{BASE_URL}/register",
    json={
        "email": "testuser@example.com",
        "password": "TestUser1234",
        "full_name": "Test User"
    }
)
if response.status_code == 200:
    print("✓ Regular user account created")
else:
    print(f"✗ Failed: {response.status_code}")
    print(f"  Response: {response.text}")

# Test 3: Promote super admin to admin role
print("\n[TEST 3] Promote admin123@gmail.com to admin")
response = requests.post(
    f"{BASE_URL}/admin/promote",
    json={"email": "admin123@gmail.com"},
    headers={"X-Admin-Token": "secretadmin123"}
)
if response.status_code == 200:
    print("✓ Super admin promoted to admin role")
else:
    print(f"✗ Failed: {response.status_code}")

# Test 4: Login as super admin
print("\n[TEST 4] Login as super admin")
response = requests.post(
    f"{BASE_URL}/login",
    json={
        "email": "admin123@gmail.com",
        "password": "SuperAdmin1234"
    }
)
if response.status_code == 200:
    super_admin_token = response.json()["access_token"]
    super_admin_role = decode_jwt_role(super_admin_token)
    print(f"✓ Login successful, role: {super_admin_role}")
else:
    print(f"✗ Failed: {response.status_code}")
    super_admin_token = None

# Test 5: Promote regular user to admin via /admin/set-role
print("\n[TEST 5] Promote testuser@example.com to admin (super admin only)")
if super_admin_token:
    response = requests.post(
        f"{BASE_URL}/admin/set-role",
        json={"email": "testuser@example.com", "role": "admin"},
        headers={"Authorization": f"Bearer {super_admin_token}"}
    )
    if response.status_code == 200:
        print("✓ User promoted to admin via /admin/set-role")
        print(f"  Response: {response.json()['message']}")
    else:
        print(f"✗ Failed: {response.status_code} - {response.text}")

# Test 6: Attempt demote (non-super admin should fail)
print("\n[TEST 6] Prevent non-super-admin from using /admin/set-role")
# Login as regular user
response = requests.post(
    f"{BASE_URL}/login",
    json={
        "email": "testuser@example.com",
        "password": "TestUser1234"
    }
)
if response.status_code == 200:
    regular_token = response.json()["access_token"]
    # Try to promote someone else
    response = requests.post(
        f"{BASE_URL}/admin/set-role",
        json={"email": "admin123@gmail.com", "role": "user"},
        headers={"Authorization": f"Bearer {regular_token}"}
    )
    if response.status_code == 403:
        print("✓ Non-super-admin correctly blocked (403)")
    else:
        print(f"✗ Security issue: got {response.status_code}")

# Test 7: Prevent super admin from changing own role
print("\n[TEST 7] Prevent super admin from changing own role")
if super_admin_token:
    response = requests.post(
        f"{BASE_URL}/admin/set-role",
        json={"email": "admin123@gmail.com", "role": "user"},
        headers={"Authorization": f"Bearer {super_admin_token}"}
    )
    if response.status_code == 400:
        print("✓ Super admin correctly blocked from changing own role (400)")
    else:
        print(f"✗ Security issue: got {response.status_code}")

# Test 8: Demote user back to user role
print("\n[TEST 8] Demote user from admin to user")
if super_admin_token:
    response = requests.post(
        f"{BASE_URL}/admin/set-role",
        json={"email": "testuser@example.com", "role": "user"},
        headers={"Authorization": f"Bearer {super_admin_token}"}
    )
    if response.status_code == 200:
        print("✓ User demoted to user role")
    else:
        print(f"✗ Failed: {response.status_code}")

print("\n" + "=" * 60)
print("✓ Super Admin Tests Complete")
print("=" * 60)
