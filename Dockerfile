FROM node:5.10

RUN mkdir -p /usr/app/src

WORKDIR /usr/app
COPY . /usr/app

RUN npm install
ENV PORT=8080
ENTRYPOINT ["npm", "start"]
