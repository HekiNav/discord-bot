const fs = require("fs");
const { Buffer } = require('node:buffer');
const { SlashCommandBuilder } = require('discord.js');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const ChartJsImage = require('chartjs-to-image');
var moment = require('moment')

module.exports = {
	data: new SlashCommandBuilder()
		.setName('stats')
		.setDescription('Gets train delay stats')
		.addStringOption(option =>
			option.setName('output')
				.setDescription('Your preferred output type')
				.setRequired(true)
				.addChoices(
					{ name: 'Graph', value: 'graph' },
					{ name: 'List', value: 'list' },
					{ name: 'Time since', value: 'since' },
					{ name: 'Places', value: 'places' },
				)),
	async execute(interaction) {
		const text = (async function(type){
			console.log(type)
			const causetable = JSON.parse(fs.readFileSync("./causes.json").toString())
			switch (type) {
				case "places":
					const dat = JSON.parse(fs.readFileSync("./places.json").toString())
					let lis = Object.keys(dat).map((key) => [key, dat[key]]);
					lis.sort((a, b) => a[0].localeCompare(b[0]))
					const promis = new Promise((resolve,reject) => {
						let text = ""
						let embs = []
						for (let i = 0; i < lis.length; i++) {
							const key = lis[i][0]
							const value = lis[i][1]
							let stat = `\n[1m${key.split(";")[0]}[0m ${key.split(";")[1]}:\n`
							for (let i = 0; i < Object.keys(value).length; i++) {
								const ke = Object.keys(value)[i]
								const valu = Object.values(value)[i]
								stat += `\t${valu} ${delayCause(ke)}\n`
							}
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
						embs.push(
							new EmbedBuilder()
							.setTitle('Places list')
							.setDescription("```ansi"+text+"```")
						)
						for (let i = 0; i < embs.length; i++) {
							const element = embs[i];
							element.setTitle(`Places list ${i+1}/${embs.length}`)
						}
						resolve(embs.map(emb => ({ephemeral: true, embeds: [emb]})))
					})
					return promis
				case "since":
					const daat = JSON.parse(fs.readFileSync("./recent.json").toString())
					const sorted = Object.keys(daat).map(k => ({date: daat[k], cause: k})).sort((a,b) => new Date(b.date) - new Date(a.date))
					const i_promise = new Promise((resolve,reject) => {
						let text = ""
						let embs = []
						for (let i = 0; i < sorted.length; i++) {
							const key = sorted[i].cause
							const value = sorted[i].date
							const added = `${moment(value).fromNow(true)} since ${key}\t${causetable[key]}\n`
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
						embs.push(
							new EmbedBuilder()
							.setTitle('Stats list')
							.setDescription(text)
						)
						for (let i = 0; i < embs.length; i++) {
							const element = embs[i];
							element.setTitle(`Stats list ${i+1}/${embs.length}`)
						}
						resolve(embs.map(emb => ({ephemeral: true, embeds: [emb]})))
					})
					return i_promise
				case "list":
					const data = JSON.parse(fs.readFileSync("./stats.json").toString())
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
					list = list.sort((a, b) => b[1] - a[1])
					const promise = new Promise((resolve,reject) => {
						let text = ""
						let embs = []
						for (let i = 0; i < list.length; i++) {
							const key = list[i][0]
							const value = list[i][1]
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
						embs.push(
							new EmbedBuilder()
							.setTitle('Stats list')
							.setDescription(text)
						)
						for (let i = 0; i < embs.length; i++) {
							const element = embs[i];
							element.setTitle(`Stats list ${i+1}/${embs.length}`)
						}
						resolve(embs.map(emb => ({ephemeral: true, embeds: [emb]})))
					})
					return promise
				case "graph":
					const d = JSON.parse(fs.readFileSync("./stats.json").toString())
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
					Object.values(d).forEach(dataday => {
						datasets.forEach(dataset => {
							dataset.data.push(dataday[dataset.label] || 0)
						})
					})
					const img = await renderChart({ labels: Object.keys(d).filter(k => k != "timestamp"), datasets: datasets })
					const buffer = Buffer.from(img)
					const file = new AttachmentBuilder(buffer, "image.png")
					const embed = new EmbedBuilder()
						.setTitle('Graph')
						.setImage('attachment://image.png');
					return {embeds: [embed], files: [file], ephemeral: true}
			}
		})(interaction.options.getString('output'))
		text.then(async t => {
			console.log(t.length ? t.length + " messages" : "1 message")
			if (t.length) {
				for (let i = 0; i < t.length; i++) {
					const element = t[i];
					if (i == 0) await interaction.reply(element)
					else await interaction.followUp(element)
				}
			} else {
				interaction.reply(t)
			}
	    })
	},
};
function renderChart(chart) {

	const c = new ChartJsImage()
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
	c.setWidth(1500).setHeight(1000).setBackgroundColor('white');
	return c.toBinary()
}

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