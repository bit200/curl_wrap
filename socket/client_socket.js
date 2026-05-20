const { io } = require("socket.io-client");
const {wsMainPort} = require("../env");
const socket = io(`http://localhost:${wsMainPort}`);

console.log("qqqqq aaaaaaaaaaaaa", );

// Send data
socket.emit("message", { text: "Hello Server!" });
console.log("qqqqq bbbbb", );