#########################################################
FROM node:20 AS build

WORKDIR /app

COPY ./package.json .
COPY ./node_modules ./node_modules

COPY ./public ./public
COPY ./src ./src

RUN npm run build

#########################################################
FROM nginx

COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html/
