# Local IoT server
goal: to serve as an edge server inside a raspberry pi

## stack
database: sqlite
frontend: html + css + js, lightweight, responsive, no framework
api: rest api
iot device: ESP32

## server features
- realtime data from IoT devices
- web interface to display data
- local machine learning enabled for anomaly detection rate
- web interface to see anomaly rate
- data storage in sqlite
- api for data access

## note
- do not code for esp32, just prepare the apis that will be accessed for the server
- model for machine learning is already ready, its a .pkg
- make a requirement.txt for easy download
- make a simple run.sh to start the server
- include a documentation in the repo for instructions