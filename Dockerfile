# Use the official Node.js 18 Lightweight Alpine image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install application dependencies
RUN npm install --production

# Copy the rest of the application files
COPY . .

# Expose the port the Express server runs on
EXPOSE 3000

# Start the application
CMD [ "node", "index.js" ]
