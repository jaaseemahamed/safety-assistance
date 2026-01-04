import requests
import os

url = 'http://localhost:3000/analyze'
image_path = 'test_face.png'

if not os.path.exists(image_path):
    print(f"Error: {image_path} not found.")
    exit(1)

files = {'image': open(image_path, 'rb')}

try:
    response = requests.post(url, files=files)
    print("Status Code:", response.status_code)
    try:
        print("Response JSON:", response.json())
    except:
        print("Response Text:", response.text)
except requests.exceptions.ConnectionError:
    print("Error: Could not connect to the server. Is it running?")
except Exception as e:
    print(f"An error occurred: {e}")
