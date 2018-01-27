FROM node:5.10

RUN mkdir -p /usr/app/src

WORKDIR /usr/app
COPY . /usr/app

EXPOSE 8080

RUN npm install
CMD ["npm", "start"]
