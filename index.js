const { createServer} = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { writeFile }  =  require("fs");
const path = require('path')


const cors = require('cors');
const app = express()
app.use(cors())
app.use(express.json())
app.use('/public', express.static(path.join(__dirname, 'static')))

const PORT = process.env.PORT || 5000

const clientID = {
    
}

const socketIO = {
    "winter":{
        admin:"simple",
        password:"admin",
        users:['one','two','three','simple']
    }    
}


app.get("/getrooms",(req,res)=>{
    const rooms = Object.keys(socketIO).map(room=>{
        return socketIO[room].password === ""?"public_"+room:"private_"+room
    })
    res.json({"rooms":rooms})
})

const http = createServer(app)
const io = new Server(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 1e8 // 100 MB
});



io.on("connection", (socket) => {
  console.log("Connection ",socket.id);

  socket.on("joinRoom",({username,password = "pass",room})=>{
    console.log("Join Room",username,password,room);
    const userRoom = room.split("_")[1]
    if(socketIO[userRoom]?.password === password){
        console.log("Joined Room Success");
        clientID[socket.id] = {
            "name":username,
            "room":userRoom
        }
        socket.join(userRoom)
        socketIO[userRoom].users.push(username)
        socket.to(userRoom).emit("receiveMsg",{username:"server",message:username+" join the room","type":"info"});
        socket.emit("joinRoomSuccess",{"username":username,"room":room,"privilege":"user"});
        socket.to(clientID[socket.id].room).emit("usersNewJoin",{"users":socketIO[clientID[socket.id].room].users})

    }
  })
  socket.on("getRoomUsers",(arg,callback)=>{
    callback({"users":socketIO[clientID[socket.id]?.room]?.users})
  })

  socket.on("upload",(data,cb)=>{
    console.log(data);
    writeFile("static/"+data.name, data.buffer, (err) => {
      cb({ message: err ? false : true,imageUrl: "public/"+data.name});
      if(err) console.log(err);
      else{
        if(clientID[socket.id]?.room === data.room.split("_")[1])
        socket.to(data.room.split("_")[1]).emit("receiveMsg",{username:data.username,image:"public/"+data.name,"caption":data.caption});
      }
    });
    
  })
  
  socket.on("newroom",({username,password,room})=>{
    socketIO[room] = { "admin":username, "password":password, "users":[username] }
    clientID[socket.id] = { "name":username, "room":room }
    socket.join(room)
    socket.emit("joinRoomSuccess",{"username":username,"room":password === ""? "public_"+room:"private_"+room,"privilege":"admin",users:[username]});
    console.log(socketIO);
  })

  socket.on("sendMsg",({username,message,room})=>{
    console.log("Message :",message,room,username,socket.rooms);
    if(clientID[socket.id]?.room === room.split("_")[1])
    socket.to(room.split("_")[1]).emit("receiveMsg",{username,message});
  })

  socket.on("clientPush",async ({username})=>{
    const userRoom = clientID[socket.id]?.room
    const usersList = socketIO[userRoom]?.users

    if(socketIO[userRoom]?.admin === clientID[socket.id].name){

        // searching the id for client username
        const targetUserID = Object.keys(clientID).find(key=>{
            if(clientID[key].name === username) return key
        })

        if(targetUserID){
            // fetch the all client socket instance in the room
            const sockets = await io.in(targetUserID).fetchSockets();

            // sending message to users in room
            io.sockets.in(userRoom).emit("receiveMsg",{username:"server",message:"admin kick "+username,"type":"info"})
            
            // remove the user from users list
            usersList.splice(usersList.indexOf(username),1)

            
            // sending the updated user list to all users
            io.sockets.in(userRoom).emit("usersNewJoin",{"users":socketIO[userRoom].users})

            sockets[0].leave(userRoom)
            // sockets[0].leave(userRoom)
            console.log("Admin Room",socket.rooms);
            delete clientID[targetUserID]
        }
        
    }
  })
  const clientLeftProtocol = ()=>{
    const userRoom = clientID[socket.id]?.room
    const userName = clientID[socket.id]?.name
    const usersList = socketIO[userRoom]?.users
    console.log(userRoom,userName,usersList);
    if(userRoom && userName && usersList ){
        socket.to(userRoom).emit("receiveMsg",{username:"server",message:userName+" left the room","type":"info"})
        socket.leave(userRoom)
        usersList.splice(usersList.indexOf(userName),1)
        socket.to(clientID[socket.id].room).emit("usersNewJoin",{"users":socketIO[clientID[socket.id].room].users})
        if(usersList.length === 0) delete socketIO[userRoom]
        delete clientID[socket.id]
        console.log(`${userName} Disconnected`);
    }
  }
  socket.on("clientLeft",clientLeftProtocol)
  socket.on("disconnect",clientLeftProtocol)
});


http.listen(PORT,()=>console.log(`server started PORT ${PORT} ...`));