# Docker has specific installation instructions for each operating system.
# Please refer to the official documentation at https://docker.com/get-started/

# Pull the Node.js Docker image:
FROM node:24-alpine


# Verify the Node.js version:
RUN node -v # Should print "v24.0.0".

# Download and install Yarn:
RUN corepack enable yarn
    
# Verify Yarn version:
RUN yarn -v

# Create a Node.js container and start a Shell session:
CMD ["sh"]

