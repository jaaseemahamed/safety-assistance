# Stage 1: Build the React Frontend
FROM node:18-alpine as build-stage

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Stage 2: Setup the Python Backend
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies (needed for OpenCV)
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install waitress

# Copy backend code
COPY server/ .

# Copy built frontend from Stage 1 to /dist
# Note: app.py expects '../dist', so if we put it in /dist and app is in /app, 
# we need to make sure the relative path works or adjust app.py.
# In app.py: DIST_DIR = os.path.join(os.path.dirname(CURRENT_DIR), 'dist')
# If app is in /app, CURRENT_DIR is /app. os.path.dirname(/app) is /.
# So it looks for /dist. This matches perfectly if we copy to /dist.
COPY --from=build-stage /app/dist /dist

# Expose port (app.py runs on 5000 by default in my edit)
EXPOSE 5000

# Run the application
CMD ["python", "app.py"]
