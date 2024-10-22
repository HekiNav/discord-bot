const fs = require("fs");
const { Buffer } = require('node:buffer');
const { SlashCommandBuilder } = require('discord.js');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const ChartJsImage = require('chartjs-to-image');
var moment = require('moment');
const MiniSearch = require("minisearch");

module.exports = {
	data: new SlashCommandBuilder()
		.setName('stats')
		.setDescription('Gets train delay stats')
		.addSubcommand(s => 
			s.setName("graph")
			 .setDescription("Get a graph of delay causes")
		).addSubcommand(s => 
			s.setName("list")
			 .setDescription("Get a list of delay causes")
		).addSubcommand(s => 
			s.setName("time_since")
			 .setDescription("Get a list of times since delay causes")
		).addSubcommand(s => 
		   s.setName("places")
			.setDescription("Get a list of delay places")
			.addStringOption(option =>
				option.setName('filter')
					.setDescription('Filter')
					.setRequired(true)
					.setAutocomplete(true)
			)
		).addSubcommand(s => 
			s.setName("info")
			 .setDescription("Get useful info")
		).addSubcommand(s => 
			s.setName("causetable")
			 .setDescription("Get a list of causecodes and their descriptions")
		),
	autocomplete(interaction) {
		const input = interaction.options.getFocused();
		const items = search(input)
		const stationTypes = {
			"STOPPING_POINT":"P",
			"STATION":"S",
			"TURNOUT_IN_THE_OPEN_LINE":"W"
		}
		
		interaction.respond(
			items.map(i => {return{name: `${i.passengerTraffic ? "p" : "f"}${stationTypes[i.type]} ${i.stationShortCode} ${i.stationName}`, value: i.stationShortCode}})
		);
	},
	async execute(interaction) {
		//Happens on slash command
		const text = (async function(type, filter){
			console.log(type)
			const causetable = JSON.parse(fs.readFileSync("./causes.json").toString())
			//Handling types
			console.log(type)
			switch (type) {
				case "places":
					return handlePlaces(causetable, filter)
				case "since":
					return handleSince(causetable)
				case "list":
					return handleList(causetable)
				case "graph":
					return handleGraph(causetable)	
				case "info":
					return handleInfo()		
				case "causetable":
					return handleCauseTable(causetable)	
			}
		})(interaction.options.getSubcommand(),interaction.options.getString("filter"))
		//Sending message(s)
		text.then(async t => {
			console.log(t.length ? t.length + " messages" : "1 message")
			if (t.length)/* One or more pages */ {
				for (let i = 0; i < t.length; i++) {
					const element = t[i];
					if (i == 0) await interaction.reply(element)
					else await interaction.followUp(element)
				}
			} else /* Single message */{
				interaction.reply(t)
			}
	    })
	},
};
//Minisearch init
let miniSearch
const stations = JSON.parse(fs.readFileSync("./stations.json").toString())

function search(text) {
	if (!miniSearch) {
        miniSearch = new MiniSearch({
            idField: 'stationShortCode',
            fields: ['stationName','stationShortCode','stationUICCode'],
            storeFields: ['stationShortCode','stationName',"type","passengerTraffic"] 
        })
		miniSearch.addAll(stations)
    }
    return miniSearch.search(text, {
		fuzzy: 0.4
	})
}
function handleInfo() {
	const data = JSON.parse(fs.readFileSync("./trainTypes.json").toString())
	const promise = new Promise((resolve,reject) => {
		//Current embed content
		let text = "Train types:\n"
		//Embeds list
		let embs = []
		for (let i = 0; i < Object.keys(data).length; i++) {
			const key = Object.keys(data)[i]
			const value = Object.values(data)[i]
			let padding = ""
			for (let i = 0; i < 4 - key.length; i++) {
				padding += "⠀"
			}
			const added = `${key}${padding}: ${value}\n`
			//If too long make a new page (embed)
			if (text.length + added.length > 4000) {
				embs.push(
					new EmbedBuilder()
					.setTitle('Useful info')
					.setDescription("```"+text+"```")
				)
				text = added
			} else {
				text += added
			}
		}
		text += `
Station letters in /stats places searching(x means any letter)
Wx : Waypoint, trains do not stop, might have switches to change tracks
Px : Platform, simple station that has no additional tracks e.g. Lentoasema, Kauniainen, Savio
Sx : Station, larger station with more tracks than the rail line going through e.g Pasila, Tampere, Oulu
xp : Station has passenger traffic
xf : Station doesn't have passenger traffic`
		//last page
		embs.push(
			new EmbedBuilder()
			.setTitle('Useful info')
			.setDescription("```"+text+"```")
		)
		// setting titles
		for (let i = 0; i < embs.length; i++) {
			const element = embs[i];
			element.setTitle(`Useful info ${i+1}/${embs.length}`)
		}
		//returning embeds
		resolve(embs.map(emb => ({ephemeral: true, embeds: [emb]})))
	})
	return promise
}
function handleCauseTable(causetable) {
	const promise = new Promise((resolve,reject) => {
		//Current embed content
		let text = ""
		//Embeds list
		let embs = []
		for (let i = 0; i < Object.keys(causetable).length; i++) {
			const key = Object.keys(causetable)[i]
			const value = Object.values(causetable)[i]
			let padding = ""
			for (let i = 0; i < 5 - key.length; i++) {
				padding += "⠀"
			}
			const added = `${key}${padding}: ${value}\n`
			//If too long make a new page (embed)
			if (text.length + added.length > 4000) {
				embs.push(
					new EmbedBuilder()
					.setTitle('Delay cause codes')
					.setDescription("```"+text+"```")
				)
				text = added
			} else {
				text += added
			}
		}
		//last page
		embs.push(
			new EmbedBuilder()
			.setTitle('Delay cause codes')
			.setDescription("```"+text+"```")
		)
		// setting titles
		for (let i = 0; i < embs.length; i++) {
			const element = embs[i];
			element.setTitle(`Delay cause codes ${i+1}/${embs.length}`)
		}
		//returning embeds
		resolve(embs.map(emb => ({ephemeral: true, embeds: [emb]})))
	})
	return promise
}
function handlePlaces(causetable,filter) {
	//Get data
	let data = JSON.parse(fs.readFileSync("./places.json").toString())
	//Map object to array
	let list = Object.keys(data).map((key) => [key, data[key]]);
	list = list.filter(p => p[0].split(";")[0] == filter)
	console.log(filter, list)
	//Sort alphabetically
	list.sort((a, b) => a[0].localeCompare(b[0]))
	const promise = new Promise((resolve,reject) => {
		//Current embed content
		let text = ""
		//Embeds list
		let embs = []
		for (let i = 0; i < list.length; i++) {
			const key = list[i][0]
			const value = list[i][1]
			let stat = `\n[1m${key.split(";")[0]}[0m ${key.split(";")[1]}:\n`
			for (let i = 0; i < Object.keys(value).length; i++) {
				const ke = Object.keys(value)[i]
				const valu = Object.values(value)[i]
				stat += `\t${valu} ${delayCause(ke)}\n`
			}
			//If too long, add a new page(embed)
			if (text.length + stat.length > 4000) {
				embs.push(
					new EmbedBuilder()
					.setTitle('Places list')
					.setDescription("```ansi"+text+"```")
				)
				text = stat
			} else {
				text += stat
			}
		}
		//Last page
		embs.push(
			new EmbedBuilder()
			.setTitle('Places list')
			.setDescription("```ansi"+text+"```")
		)
		//Setting titles
		for (let i = 0; i < embs.length; i++) {
			const element = embs[i];
			element.setTitle(`Places list ${i+1}/${embs.length}`)
		}
		//Returning messages
		resolve(embs.map(emb => ({ephemeral: true, embeds: [emb]})))
	})
	return promise
}
async function handleGraph(causetable) {
	//get data
	const data = JSON.parse(fs.readFileSync("./stats.json").toString())
	//map data into chart.js format
	let datasets = Object.keys(causetable).map(key => {
		return{ 
			label: key, 
			data: [],
			datalabels: {
				align: 'start',
				anchor: 'start'
	  		}
		}
	})

	Object.values(data).forEach(dataday => {
		datasets.forEach(dataset => {
			dataset.data.push(dataday[dataset.label] || 0)
		})
	})
	//Sending to quickchart.io api for rendering
	const img = await renderChart({ labels: Object.keys(data).filter(k => k != "timestamp"), datasets: datasets })
	//Handling the image so discord can use it
	const buffer = Buffer.from(img)
	//adding it to the message
	const file = new AttachmentBuilder(buffer, "image.png")
	const embed = new EmbedBuilder()
		.setTitle('Graph')
		.setImage('attachment://image.png');
	return {embeds: [embed], files: [file], ephemeral: true}
}
function handleSince(causetable) {
	//get data
	const data = JSON.parse(fs.readFileSync("./recent.json").toString())
	//sort and turn into array
	const sorted = Object.keys(data).map(k => ({date: data[k], cause: k})).sort((a,b) => new Date(b.date) - new Date(a.date))
	const promise = new Promise((resolve,reject) => {
		//Current embed content
		let text = ""
		//Embeds list
		let embs = []
		for (let i = 0; i < sorted.length; i++) {
			const key = sorted[i].cause
			const value = sorted[i].date
			const added = `${moment(value).fromNow(true)} since ${key}\t${causetable[key]}\n`
			//If too long make a new page (embed)
			if (text.length + added.length > 4000) {
				embs.push(
					new EmbedBuilder()
					.setTitle('Stats list')
					.setDescription(text)
				)
				text = added
			} else {
				text += added
			}
		}
		//last page
		embs.push(
			new EmbedBuilder()
			.setTitle('Stats list')
			.setDescription(text)
		)
		// setting titles
		for (let i = 0; i < embs.length; i++) {
			const element = embs[i];
			element.setTitle(`Stats list ${i+1}/${embs.length}`)
		}
		//returning embeds
		resolve(embs.map(emb => ({ephemeral: true, embeds: [emb]})))
	})
	return promise
}
function handleList(causetable) {
	//get data
	const data = JSON.parse(fs.readFileSync("./stats.json").toString())
	//BIG FORMAT
	let combined = {}
	for (let i = 0; i < Object.keys(data).length; i++) {
		const key = Object.keys(data)[i]
		if (key == "timestamp") continue
		const day = Object.values(data)[i]
		for (let i = 0; i < Object.keys(day).length; i++) {
			const key = Object.keys(day)[i]
			const value = Object.values(day)[i]
			if (!combined[key]) combined[key] = {value: 0}
			combined[key].value += value
		}
	}
	let list = Object.keys(combined).map((key) => [key, combined[key].value]);
	//and sort
	list = list.sort((a, b) => b[1] - a[1])
	const promise = new Promise((resolve,reject) => {
		//current embed text
		let text = ""
		//embed list
		let embs = []
		for (let i = 0; i < list.length; i++) {
			const key = list[i][0]
			const value = list[i][1]
			//if too long, add a new page(embed)
			if (text.length + `${value}\t${key}\t${causetable[key]}\n`.length > 4000) {
				embs.push(
					new EmbedBuilder()
					.setTitle('Stats list')
					.setDescription(text)
				)
				text = `${value}\t${key}\t${causetable[key]}\n`
			} else {
				text += `${value}\t${key}\t${causetable[key]}\n`
			}
		}
		//last page
		embs.push(
			new EmbedBuilder()
			.setTitle('Stats list')
			.setDescription(text)
		)
		//setting titles
		for (let i = 0; i < embs.length; i++) {
			const element = embs[i];
			element.setTitle(`Stats list ${i+1}/${embs.length}`)
		}
		resolve(embs.map(emb => ({ephemeral: true, embeds: [emb]})))
	})
	return promise
}
function renderChart(chart) {
	//init chart
	const c = new ChartJsImage()
	//add chart.js config
	c.setConfig({
			type: 'line',
			data: chart,
			options: {
			plugins: {
				title: {
				display: true,
				text: (ctx) => 'Chart.js Line Chart - stacked=' + ctx.chart.options.scales.y.stacked
				},
				tooltip: {
				mode: 'index'
				},
				datalabels: {
					borderRadius: 4,
					color: 'white',
					font: {
					  weight: 'bold'
					},
					padding: 6
				}
			},
			interaction: {
				mode: 'nearest',
				axis: 'x',
				intersect: false
			},
			scales: {
				x: {
				title: {
					display: true,
					text: 'Month'
				}
				},
				y: {
				stacked: true,
				title: {
					display: true,
					text: 'Value'
				}
				}
			}
			}
		})
	//some more config
	c.setWidth(1500).setHeight(1000).setBackgroundColor('white');
	return c.toBinary()
}
//delay cause formatting
function delayCause(c="") {
    let bg = ""
    let color = ""
	const causetable = JSON.parse(fs.readFileSync("./causes.json").toString())
    switch (c.slice(0,1)) {
        case "A":
            bg = null
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
                case "J1":
                    color = 37
                    break
                default:
                    break;
            }
            break;
        case "K":
            bg = null
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
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
            switch (c.slice(0,2)) {
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
    return `[1;${bg?bg+";":""}${color?color:37}m${c}[0m  ${causetable[c]}`
}