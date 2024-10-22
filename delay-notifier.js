const {EmbedBuilder, WebhookClient, ComponentType, ButtonBuilder, ActionRowBuilder, ButtonStyle, Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('node:fs');
//Tokens and stuff
const {allDelayChannelId, interestingDelayChannelId, token} = require('./config.json')
//creating discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
//Query digitraffic for currently running trains
async function getData(f){
    const query = `{"query": "{currentlyRunningTrains{trainNumber commuterLineid trainType{name}timeTableRows{differenceInMinutes scheduledTime actualTime station{name shortCode}causes{thirdCategoryCode{code name description}detailedCategoryCode{code name}categoryCode{name code}}}}}"}`
    const data = await fetch("https://rata.digitraffic.fi/api/v2/graphql/graphql", {
        method: "POST",
        body: query,
        headers: {
            "Content-Type" : "application/json",
            "Accept-Encoding" : "gzip"
        }
    })
    console.log("Doing good!")
    f(data.json())
}
//object Date to hh:mm:ss
function dateToTime(date = new Date()){
    return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}:${padNumber(date.getSeconds())}`
}
//Converting numbers to 2-long strings
//9  => 09
//34 => 34
function padNumber(n){
    return n < 10 ? "0" + n.toString(): n
}
//Main function
function api(){
    //Fetch data
    getData(d => {
        d.then(data => {
            //Set timestamp
            const timestamp = new Date()
            //Filter trains to ones with delays
            let trainsWithDelays = data.data.currentlyRunningTrains.filter(t => t.timeTableRows.find(d => d.causes ? d.causes.find(c => {
                const code = c.thirdCategoryCode ? c.thirdCategoryCode.code : c.detailedCategoryCode ? c.detailedCategoryCode.code : c.categoryCode.code
                const id = (t.commuterLineid ? `(${t.commuterLineid})` : "") + t.trainType.name + " " + t.trainNumber + " " +  d.station.shortCode + " " + code
                console.log(ids.find(i => i == id))
                console.log(id)
                if (!ids.find(i => i == id)) return true
                else return null
            }): null))
            //Formatting train array
            trainsWithDelays = trainsWithDelays.map(t => {return {
                number: t.trainNumber, 
                type: t.trainType.name, 
                name: (t.commuterLineid ? `(${t.commuterLineid})` : "") + t.trainType.name + " " + t.trainNumber, 
                delays: t.timeTableRows
            }})
            //Main loop
            trainsWithDelays.forEach(t => {
                let all = ""
                let interesting = ""
                //Filter train timetable
                const delays = t.delays.filter(r => r.causes)
                for(let i = 0; i < delays.length; i++){
                    const d = delays[i]
                    var interestingCauses = ""
                    var allCauses = ""
                    d.causes.forEach(c => {
                        const code = c.thirdCategoryCode ? c.thirdCategoryCode.code : c.detailedCategoryCode ? c.detailedCategoryCode.code : c.categoryCode.code
                        const id = t.name + " " +  d.station.shortCode + " " + code
                        //if new delays
                        if (ids.find(i => i == id)) return
                            //adding to id list (ids.json)
                            ids.push(id)
                            //adding to stats (delay counts by code) list (stats.json)
                            if (!stats[timestamp.toISOString().split("T")[0]]) stats[timestamp.toISOString().split("T")[0]] = {}
                            if (stats[timestamp.toISOString().split("T")[0]][code]) {
                                stats[timestamp.toISOString().split("T")[0]][code] += 1
                            } else {
                                stats[timestamp.toISOString().split("T")[0]][code] = 1
                            }
                            //adding to places list (places.json)
                            if (!places[d.station.shortCode+";"+d.station.name]) places[d.station.shortCode+";"+d.station.name] = {}
                            if (places[d.station.shortCode+";"+d.station.name][code]) {
                                places[d.station.shortCode+";"+d.station.name][code] += 1
                            } else {
                                places[d.station.shortCode+";"+d.station.name][code] = 1
                            }
                            //adding to recents list (recent.json)
                            recents[code] = timestamp.toISOString()
                        
                        //actual thing being added to the message
                        if (!notInteresting.find(type => type == code)) {
                            interestingCauses += delayCause(c)
                            allCauses += delayCause(c)
                        } else {
                            allCauses += delayCause(c)
                        }
                        
                    })
                    //Combining message elements
                    //e.g. Kuusankoski 13:24:00 => 13:51:59 (+28 min) L603
                    const time = dateToTime(new Date(d.scheduledTime)) + " => " + dateToTime(new Date(d.actualTime)) + " (" + delayTime(d.differenceInMinutes) + ")"
                    all += `\n[1m${d.station.name}[0m ${time} ${allCauses}`
                    interesting += `\n[1m${d.station.name}[0m ${time} ${interestingCauses}`
                }
                //Button
                const causeDescs = new ButtonBuilder()
                    .setCustomId('expand')
                    .setLabel('Show cause code descriptions')
                    .setStyle(ButtonStyle.Primary);
        
                const row = new ActionRowBuilder()
                    .addComponents(causeDescs);
                
                if(interestingCauses.length) {
                    //Send to #interesting-delays
                    const response = interestingChannel.send({
                        username: "Interesting delay notifier",
                        avatarURL: '',
                        embeds: [new EmbedBuilder()
                            //Title with train name and scheduled origin and destination
                            .setTitle(t.name + " " + t.delays[0].station.name + " => " + t.delays[t.delays.length-1].station.name)
                            //Set title to link to juliadata
                            .setURL(`https://juliadata.fi/live/train?n=${t.name.split(" ")[1]}`)
                            //Set color to julia train color
                            .setColor(hexToRgb(colors[t.type]))
                            //Content with ansi formatting
                            .setDescription("```ansi"+interesting+"```")
                        ],
                        //Add button
                        components: [
                            row
                        ]
                    })
                    //Button functions
                    response.then(r => {
                        const collector = r.createMessageComponentCollector({ componentType: ComponentType.Button, time: 3600_000 });
                        //Add cause descriptions to the message on click
                        collector.on('collect', i => {
                            let desc = r.embeds[0].data.description
                            for (let i = 0; i < Object.keys(causetable).length; i++) {
                                const key = Object.keys(causetable)[i];
                                const value = Object.values(causetable)[i];
                                if (!desc.includes(key+"[0m")) continue
                                desc = desc.replaceAll(key+"[0m", `${key}[0m ${value}`)
                            }
                            r.edit({
                                embeds: [new EmbedBuilder()
                                    .setTitle(r.embeds[0].data.title) 
                                    .setURL(r.embeds[0].data.url) 
                                    .setColor(hexToRgb(colors[r.embeds[0].data.title.split(" ")[0]]))
                                    .setDescription(desc) 
                                ],
                                components: [],
                            })
                        });
                        //Disable the button after some time
                        collector.on("end", collected => {
                            const causeDescs = new ButtonBuilder()
                                .setCustomId('expand')
                                .setLabel('Message too old')
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true)
                    
                            const row = new ActionRowBuilder()
                                .addComponents(causeDescs);
                            r.edit({
                              components: [row]
                            })
                        });
                    })
                    
                }
                if(allCauses.length) {
                    //Send message to #all-delays
                    const response = allChannel.send({
                        username: "Train delay notifier",
                        avatarURL: '',
                        embeds: [new EmbedBuilder()
                            .setTitle(t.name + " " + t.delays[0].station.name + " => " + t.delays[t.delays.length-1].station.name)
                            .setURL(`https://juliadata.fi/live/train?n=${t.name.split(" ")[1]}`)
                            .setColor(hexToRgb(colors[t.type]))
                            .setDescription("```ansi"+all+"```")
                        ],
                        components: [
                            row
                        ]
                    })
                    //Button functions
                    response.then(r => {
                        const collector = r.createMessageComponentCollector({ componentType: ComponentType.Button, time: 3600_000 });
                        //Add cause descriptions to the message on click
                        collector.on('collect', i => {
                            let desc = r.embeds[0].data.description
                            for (let i = 0; i < Object.keys(causetable).length; i++) {
                                const key = Object.keys(causetable)[i];
                                const value = Object.values(causetable)[i];
                                if (!desc.includes(key+"[0m")) continue
                                desc = desc.replaceAll(key+"[0m", `${key}[0m ${value}`)
                            }
                            r.edit({
                                embeds: [new EmbedBuilder()
                                    .setTitle(r.embeds[0].data.title) 
                                    .setURL(r.embeds[0].data.url) 
                                    .setColor(hexToRgb(colors[r.embeds[0].data.title.split(" ")[0]]))
                                    .setDescription(desc) 
                                ],
                                components: [],
                            })
                        });
                        //Disable the button after some time
                        collector.on("end", collected => {
                            const causeDescs = new ButtonBuilder()
                                .setCustomId('expand')
                                .setLabel('Message too old')
                                .setStyle(ButtonStyle.Primary)
                                .setDisabled(true)
                    
                            const row = new ActionRowBuilder()
                                .addComponents(causeDescs);
                            r.edit({
                              components: [row]
                            })
                        });
                    })
                }
            });
            //Logging timestamp to see if the bot is working
            console.log(stats.timestamp.split("T")[0])
            //Writing to all stats files
            if (stats.timestamp.split("T")[0] != timestamp.toISOString().split("T")[0]) ids = []
            stats.timestamp = timestamp.toISOString()
            fs.writeFile("ids.json",JSON.stringify(ids), e => e)
            fs.writeFile("stats.json",JSON.stringify(stats), e => e)
            fs.writeFile("recent.json",JSON.stringify(recents), e => e)
            fs.writeFile("places.json",JSON.stringify(places), e => e)
        })
    })
}
//Delay colors
function delayTime(min) {
    let color = ""
    if (min <= 5 && min >= -3) {
        color = 32
    } else if (min < -3) {
        color = 36
    } else if (min > 30) {
        color = 31
    } else if (min > 5) {
        color = 33
    }
    return `[1;${color}m${min < 0 ? "" : "+"}${min} min[0m`
}
//Please rewrite
//Gets the delay cause formatting
function delayCause(c) {
    let bg = ""
    let color = ""
    switch (c.categoryCode.code) {
        case "A":
            bg = null
            switch (c.detailedCategoryCode.code) {
                case "A1":
                    color = 33
                    break;
                case "A2":
                    color = 37
                    break;
                case "A3":
                    color = 31
                    break;
                default:
                    break;
            }
            break;
        case "E":
            bg = null
            switch (c.detailedCategoryCode.code) {
                case "E1":
                    color = 36
                    break;
                case "E2":
                    color = 32
                    break;
                default:
                    break;
            }
            break;
        case "H":
            bg = null
            switch (c.detailedCategoryCode.code) {
                case "H1":
                    color = 31
                    break;
                case "H2":
                    color = 33
                    break;
                case "H3":
                    color = 37
                    break;
                default:
                    break;
            }
            break;
        case "I":
            bg = 41
            switch (c.detailedCategoryCode.code) {
                case "I1":
                    color = 34
                    break;
                case "I2":
                    color = 33
                    break;
                case "I3":
                    color = 31
                    break;
                default:
                    break;
            }
            break;
        case "J":
            bg = 46
            switch (c.detailedCategoryCode.code) {
                case "J1":
                    color = 37
                    break
                default:
                    break;
            }
            break;
        case "K":
            bg = null
            switch (c.detailedCategoryCode.code) {
                case "K1":
                    color = 33
                    break;
                case "K2":
                    color = 31
                    break;
                case "K3":
                    color = 34
                    break;
                case "K4":
                    color = 36
                    break;
                case "K5":
                    color = 36
                    break;
                case "K6":
                    color = 35
                    break;
                default:
                    break;
            }
            break;
        case "L":
            bg = null
            switch (c.detailedCategoryCode.code) {
                case "L1":
                    color = 37
                    break;
                case "L2":
                    color = 37
                    break;
                case "L3":
                    color = 33
                    break;
                case "L4":
                    color = 35
                    break;
                case "L5":
                    color = 36
                    break;
                case "L6":
                    color = 31
                    break;
                case "L7":
                    color = 33
                    break;
                case "L8":
                    color = 36
                    break;
                default:
                    break;
            }
            break;
        case "M":
            bg = null
            switch (c.detailedCategoryCode.code) {
                case "M1":
                    color = 36
                    break;
                case "M2":
                    color = 33
                    break;
                default:
                    break;
            }
            break;
        case "O":
            bg = 41
            switch (c.detailedCategoryCode.code) {
                case "O1":
                    color = 37
                    break;
                case "O2":
                    color = 37
                    break;
                case "O3":
                    color = 37
                    break;
                case "O4":
                    color = 37
                    break;
                default:
                    break;
            }
            break;
        case "P":
            bg = null
            switch (c.detailedCategoryCode.code) {
                case "P1":
                    color = 33
                    break;
                case "I2":
                    color = 34
                    break;
                case "P3":
                    color = 35
                    break;
                case "P4":
                    color = 32
                    break;
                default:
                    break;
            }
            break;
        case "R":
            bg = null
            switch (c.detailedCategoryCode.code) {
                case "R1":
                    color = 37
                    break;
                case "R2":
                    color = 33
                    break;
                case "R3":
                    color = 35
                    break;
                case "R4":
                    color = 34
                    break;
                default:
                    break;
            }
            break;
        case "S":
            bg = null
            switch (c.detailedCategoryCode.code) {
                case "S1":
                    color = 33
                    break;
                case "S2":
                    color = 31
                    break;
                default:
                    break;
            }
            break;
        case "T":
            bg = null
            switch (c.detailedCategoryCode.code) {
                case "T1":
                    color = 37
                    break;
                case "T2":
                    color = 33
                    break;
                case "T3":
                    color = 31
                    break;
                default:
                    break;
            }
            break;
        case "V":
            bg = null
            switch (c.detailedCategoryCode.code) {
                case "V1":
                    color = 33
                    break;
                case "V2":
                    color = 31
                    break;
                case "V3":
                    color = 35
                    break;
                case "V3":
                    color = 34
                    break;
                default:
                    break;
            }
            break;
        default:
            break;
    }
    return `\n[1;${bg?bg+";":""}${color?color:37}m${c.thirdCategoryCode ? c.thirdCategoryCode.code : c.detailedCategoryCode.code}[0m`
}
//Hex to [r,b,g]
function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : null;
  }
//colors for train types
const colors = {
    AE: "#FF6A00",
    H:  "#770000",
    HDM:"#770000",
    HL: "#004400",
    HLV:"#78B600",
    HSM:"#004400",
    HV: "#FF006E",
    IC: "#FF0000",
    MV: "#FF006E",
    P:  "#0000FF",
    PVV:"#007777",
    PYO:"#0000FF",
    S:  "#007700",
    T:  "#000077",
    TYO:"#7F6a00",
    VET:"#660066",
    VEV:"#9E009E"
}   
//Defining variables
//They are given values later from async operations
let interestingChannel
let allChannel
let ids 
let stats
let recents
let places
let causetable
//Blacklist of delay codes for interesting delays
const notInteresting = [
    "E2",
    "E201",
    "L201",
    "E1",
    "J1",
    "E2",
    "T102",
    "R1",
    "L204",
    "M1",
    "L202",
    "L601",
    "L101",
    "L302",
    "L601",
    "M102"
]
//Login to Foobot
client.login(token)
//Wait for stats files to load
Promise.all([
    fs.readFileSync("ids.json"),
    fs.readFileSync("stats.json"),
    fs.readFileSync("recent.json"),
    fs.readFileSync("places.json"),
    fs.readFileSync("causes.json"),
]).then(raw => {
    //Wait for discord login success
    client.on('ready', client => {
        console.log(`Logged in as ${client.user.tag}!`)
        interestingChannel = client.channels.cache.get(interestingDelayChannelId)
        allChannel = client.channels.cache.get(allDelayChannelId) 
        console.log(allChannel)
        setInterval(api,10000)
    })
    //Handling the read stats files from buffers
    const data = JSON.parse("["+raw.toString()+"]")
    ids = data[0]
    stats = data[1]
    recents = data[2]
    places = data[3]
    causetable = data[4]
})

