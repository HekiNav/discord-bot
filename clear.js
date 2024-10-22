const fs = require("fs")
fs.writeFile("ids.json","[]", e => e)
console.log("Cleared successfully")