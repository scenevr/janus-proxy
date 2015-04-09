Janus Proxy
========================

This is a fork of the janus presence server to connect to some hard-coded scenevr scenes and stream them as janus #sync commands. This enables janus clients to connect to scenevr worlds. This is a proof-of-concept and doesn't enable complete synchronicity between janusvr and scenevr clients, but it is something both teams are working toward.

This code is based on the great work  by lisa-lionheart on the [Janus VR Presence Server](https://github.com/lisa-lionheart/janus-server).

## Usage

Before you start - edit `html/index.html` to reflect the ip address of your computer on your LAN.

Then - assuming you have a unix-like-system:

```
npm install
./generate_key
node server.js
```

In a different terminal at the same time:

```
cd html
python -m SimpleHTTPServer 8000
````

Then run janus and connect to `http://localhost:8000/index.html`. You should get an empty scene with a grid, that quickly gets populated with the scenevr scene that is specified in `src/Session.js:37`.