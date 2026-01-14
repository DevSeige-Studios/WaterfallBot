const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { send: sendHourly } = require("../../hourlyWorker.js");
const dailyWorker = require("../../dailyWorker.js");
const analyticsWorker = require("../../util/analyticsWorker.js");
const { settings } = require("../../util/settingsModule.js");
const e = require("../../data/emoji.js");
//
module.exports = {
	data: new SlashCommandBuilder()
		.setName("worker")
		.setDescription("Manually trigger hourly income or daily worker tasks (DEV ONLY)")
		.addStringOption(option =>
			option.setName("type")
				.setDescription("Specify which worker to run")
				.setRequired(true)
				.addChoices(
					{ name: "hourly", value: "hourly" },
					{ name: "daily", value: "daily" },
					{ name: "export", value: "export" }
				)
		),
	integration_types: [0, 1],
	contexts: [0, 1, 2],
	dev: true,
	explicit: process.env.CANARY === "true" ? false : true,
	async execute(bot, interaction, funcs) {
		await interaction.reply({ content: `${e.loading} Please wait...` });
		const type = interaction.options.getString("type");
		if (type === "hourly") {
			await sendHourly(bot);
			await interaction.editReply("Hourly Worker executed successfully.");
		} else if (type === "daily") {
			await dailyWorker.send(bot);
			await interaction.editReply("Daily Worker executed successfully.");
		} else if (type === "export") {
			await analyticsWorker.exportAnalytics();
			await interaction.editReply("Analytics Export triggered.");
		} else {
			await interaction.editReply("Invalid worker type specified.");
		}
	},
	help: {
		name: "worker",
		description: "Manually trigger hourly or daily worker tasks",
		category: "Dev",
		permissions: ["Developer"],
		botPermissions: [],
		created: 1764938508
	}
};

// contributors: @relentiousdragon