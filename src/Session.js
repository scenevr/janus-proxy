
var byline = require('byline');

var WebSocket = require('ws');
var htmlparser = require("htmlparser");
var StyleMap = require('./style_map');
var Color = require('color');

function Session(server, socket) {

    var self = this;

    this._socket = socket;
    this._authed = false;
    this._server = server;
    this._rooms = [];

    this.id = null;
    this.currentRoom = null;


    byline(socket).on('data', this.parseMessage.bind(this));

    socket.on('close', function() {

        if(self.currentRoom) {
            self.currentRoom.emit('user_disconnected', {userId:self.id});
        }

        self._rooms.forEach(function(room){
            room.removeSession(self);
        });

        self.destroy();
    });

  this.ws = new WebSocket('ws://puckman.scenevr.hosting/game.xml', 'scenevr');
  //this.ws = new WebSocket('ws://home.scenevr.hosting/home.xml', 'scenevr');
   
  this.ws.on('open', function open() {
    // ws.send('something');
  });
   
  this.messages = [];
  this.assets = {};
  this.synced = false;

  this.ws.on('message', function(data, flags) {
    if (self.messages) {
      self.messages.push(data);
    }
  });

  this.interval = setInterval(this.onTick.bind(this), 50);
}

Session.prototype.destroy = function () {
  clearInterval(this.interval);
  
  this.ws.close();

  delete this.messages;
  delete this.assets;
};

Session.prototype.startSync = function () {
  if(!this.synced) {
    var data = {
        roomId: this.currentRoom.id,
        userId: this.id,
        message: '#sync'
    };

    this.send('user_chat', data);

    this.synced = true;
  }
};

Session.prototype.onTick = function () {
  var self = this;

  function reencode(text){
    return text.replace(/"/g, '^');
  }

  function urlToId(url){
    return url.toLowerCase().replace(/[^a-z0-9]+/g,'');
  }

  if (!this.id || (this.messages.length === 0)) {
    return;
  }

  this.startSync();

  var handler = new htmlparser.DefaultHandler(function (error, dom) {
      if (error) {
        // [...do something for errors...]
      } else {
        // [...parsing done, do something...]
      }
  });

  var parser = new htmlparser.Parser(handler);

  var markup = [];

  while(this.messages.length > 0){
    var message = this.messages.pop();
    
    parser.parseComplete(message);
    
    //console.log(JSON.stringify(handler.dom, false, null));

    handler.dom[0].children.forEach( function (child) {
      if (!child.attribs) {
        return;
      }

      var attr = {};
      var name = null;
      var styles = new StyleMap(child.attribs.style);

      if (child.name === 'box') {
        name = "Object";
  
        if (styles.visibility === 'hidden') {
          // dont render invisibles because they're fucking annoying
          return;
        } else {
          attr.id = 'cube';
        }

        attr.collision_id = 'cube';
      }

      if (child.name === 'model') {
        name = "Object";

        var id = urlToId(child.attribs.src);
        attr.id = id;
        attr.collision_id = id;

        if (!self.assets[id]) {
          // markup.push('<AssetObject id="' + id + '" src="ghost.obj" />');
          self.assets[id] = true;
        }
      }

      attr.js_id = child.attribs.uuid;
      attr.pos = child.attribs.position || "0 0 0";
      attr.scale = child.attribs.scale || "1 1 1";

      var color;
      
      try {
        color = Color(styles.color || '#ccc');
      } catch (e) {
        color = Color('grey');
      }

      attr.col = [color.red() / 256.0, color.green() / 256.0, color.blue() / 256.0].join(' ');

      var el = '<' + name + ' ';
      for (var key in attr) {
        el += key + '="' + attr[key] + '" ';
      }
      el += ' />';

      markup.push(el)
    });
  }

  if (markup.length > 0 ) {
    this.send('user_moved', { 
      roomId: this.currentRoom.id,
      userId: this.id,
      "position": {
        room_edit: reencode(markup.join(''))
      }
    });
  }
}

// S->C: {"method":"user_moved","data":{"roomId":"5ff204611598b2ed9971c86eab5441db","userId":"FastIsaiah505","position":{"pos":"-0.146623 -0.000999985 1.04238","dir":"0.212 0.418 -0.883","view_dir":"0.207 0.46 -0.863","up_dir":"-0.107 0.888 0.447","head_pos":"0 0 0","room_edit":"<Text id=^^ js_id=^deathNote^ locked=^false^ onclick=^^ oncollision=^^ pos=^0.100000 15.000000 0.000000^ vel=^0.000000 0.000000 0.000000^ xdir=^1.000 0.000 0.000^ ydir=^0.000 1.000 0.000^ zdir=^0.000 0.000 1.000^ scale=^30.000000 30.000000 30.000000^ col=^1.000 1.000 1.000^ lighting=^true^ loop=^false^ auto_play=^false^ play_once=^false^ shader_id=^^></Text>"}}}


module.exports = Session;

Session.prototype.send = function(method, data) {
    var packet = JSON.stringify({method:method,data:data});
    this._socket.write(packet+'\r\n');
    // console.log('S->C: ' + packet);
};

Session.prototype.clientError = function(message) {
    log.error('Client error ('+this._socket.remoteAddress + ', ' + (this.id || 'Unnamed') + '): ' + message);
    this.send('error', {message:message});
};

Session.validMethods = ['logon', 'subscribe', 'unsubscribe', 'enter_room', 'move', 'chat', 'portal'];

Session.prototype.parseMessage = function(data){

    // console.log('C->S: ' + data);

    var payload;

    try {
        payload = JSON.parse(data);
    } catch(e) {
        this.clientError('Unable to parse last message');
        return;
    }

    if(Session.validMethods.indexOf(payload.method) === -1) {
        this.clientError('Invalid method: ' + payload.method);
        return;
    }

    if(payload.method !== 'logon' && !this._authed) {
        this.clientError('Not signed on must call logon first');
        return;
    }

    Session.prototype[payload.method].call(this,payload.data);
};




/*************************************************************************/
/*  Client methods                                                       */
/*************************************************************************/

Session.prototype.logon = function(data) {
    console.log("login");
    if(data.userId === undefined) {
        this.clientError('Missing userId in data packet');
        return;
    }

    if(data.roomId === undefined) {
        this.clientError('Missing roomId in data packet');
        return;
    }

    //TODO: Auth

    if(!this._server.isNameFree(data.userId)) {
        this.clientError('User name is already in use');
        return;
    }

    this._authed = true;
    this.id = data.userId;

    log.info('User: ' + this.id + ' signed on');

    this.currentRoom = this._server.getRoom(data.roomId);
    this.subscribe(data);
};

Session.prototype.enter_room = function(data) {

    if(data.roomId  === undefined) {
        this.clientError('Missing roomId in data packet');
        return;
    }

    var oldRoomId = null;
    if(this.currentRoom) {
        oldRoomId = this.currentRoom.id;
        this.currentRoom.emit('user_leave', { 
            userId: this.id, 
            roomId: this.currentRoom.id,
            newRoomId: data.roomId
        });
    }

    this.currentRoom = this._server.getRoom(data.roomId);
    this.currentRoom.emit('user_enter', { 
        userId: this.id, 
        roomId: data.roomId,
        oldRoomId: oldRoomId
    });
};

Session.prototype.move = function(position) {

    var data = {
        roomId: this.currentRoom.id,
        userId: this.id,
        position: position
    };

    this.currentRoom.emit('user_moved', data);
};

Session.prototype.chat = function(message) {

    var data = {
        roomId: this.currentRoom.id,
        userId: this.id,
        message: message
    };

    this.currentRoom.emit('user_chat', data);
};

Session.prototype.subscribe = function(data) {

    if(data.roomId  === undefined) {
        this.clientError('Missing roomId in data packet');
        return;
    }

    var room = this._server.getRoom(data.roomId);

    if(this._rooms.indexOf(room) === -1) {
        room.addSession(this);
        this._rooms.push(room);
    }

    this.send('okay');
};

Session.prototype.unsubscribe = function(data) {

    if(data.roomId  === undefined) {
        this.clientError('Missing roomId in data packet');
        return;
    }

    var room = this._server.getRoom(data.roomId);

    var i = this._rooms.indexOf(room);
    if(i !== -1) {
        room.removeSession(this);
        this._rooms.slice(i,1);
    }

    this.send('okay');
};


Session.prototype.portal = function(portal) {

    //TODO: Persist portals

    var data = {
        roomId: this.currentRoom.id,
        userId: this.id,
        url: portal.url,
        pos: portal.pos,
        fwd: portal.fwd
    };

    this.currentRoom.emit('user_portal', data);
    this.send('okay');
};
