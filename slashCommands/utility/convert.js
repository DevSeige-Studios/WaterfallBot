const { SlashCommandBuilder, MessageFlags, ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const e = require("../../data/emoji.js");
const axios = require("axios");
const moment = require("moment-timezone");
const commandMeta = require("../../util/i18n.js").getCommandMetadata();

let currencyCache = {
    rates: null,
    lastUpdate: 0
};

const CACHE_DURATION = 12 * 60 * 60 * 1000;

async function getCurrencyRates(logger) {
    const now = Date.now();
    if (currencyCache.rates && (now - currencyCache.lastUpdate < CACHE_DURATION)) {
        return currencyCache.rates;
    }

    try {
        const response = await axios.get("https://api.exchangerate-api.com/v4/latest/USD");
        currencyCache.rates = response.data.rates;
        currencyCache.lastUpdate = now;
        return currencyCache.rates;
    } catch (error) {
        logger.error("[/CONVERT] Error fetching currency rates:", error);
        return null;
    }
}

const CONVERSIONS = {
    length: {
        units: {
            km: 1000,
            m: 1,
            cm: 0.01,
            mm: 0.001,
            mi: 1609.344,
            ft: 0.3048,
            in: 0.0254
        },
        formulas: {
            "km-mi": (v) => `${v} × 0.621371`,
            "mi-km": (v) => `${v} × 1.609344`,
            "m-ft": (v) => `${v} × 3.28084`,
            "ft-m": (v) => `${v} × 0.3048`,
            "cm-in": (v) => `${v} × 0.393701`,
            "in-cm": (v) => `${v} × 2.54`,
            "mm-in": (v) => `${v} × 0.0393701`,
            "in-mm": (v) => `${v} × 25.4`
        }
    },
    mass: {
        units: {
            kg: 1000,
            g: 1,
            mg: 0.001,
            lb: 453.592,
            oz: 28.3495,
            ton: 1000000
        },
        formulas: {
            "kg-lb": (v) => `${v} × 2.20462`,
            "lb-kg": (v) => `${v} × 0.453592`,
            "g-oz": (v) => `${v} × 0.035274`,
            "oz-g": (v) => `${v} × 28.3495`,
            "ton-lb": (v) => `${v} × 2204.62`,
            "lb-ton": (v) => `${v} × 0.000453592`
        }
    },
    area: {
        units: {
            m2: 1,
            km2: 1000000,
            ft2: 0.092903,
            mi2: 2589988.11,
            acre: 4046.86,
            ha: 10000
        },
        formulas: {
            "m2-ft2": (v) => `${v} × 10.7639`,
            "ft2-m2": (v) => `${v} × 0.092903`,
            "km2-mi2": (v) => `${v} × 0.386102`,
            "mi2-km2": (v) => `${v} × 2.58999`,
            "acre-ha": (v) => `${v} × 0.404686`,
            "ha-acre": (v) => `${v} × 2.47105`
        }
    },
    volume: {
        units: {
            l: 1,
            ml: 0.001,
            gal: 3.78541,
            oz: 0.0295735,
            cup: 0.236588
        },
        formulas: {
            "l-gal": (v) => `${v} × 0.264172`,
            "gal-l": (v) => `${v} × 3.78541`,
            "ml-oz": (v) => `${v} × 0.033814`,
            "oz-ml": (v) => `${v} × 29.5735`,
            "cup-ml": (v) => `${v} × 236.588`,
            "ml-cup": (v) => `${v} × 0.00422675`
        }
    },
    power: {
        units: {
            w: 1,
            kw: 1000,
            hp: 745.7,
            j: 1,
            kwh: 3600000,
            cal: 4.184
        },
        formulas: {
            "w-kw": (v) => `${v} / 1000`,
            "kw-w": (v) => `${v} × 1000`,
            "kwh-j": (v) => `${v} × 3,600,000`,
            "j-kwh": (v) => `${v} / 3,600,000`,
            "cal-j": (v) => `${v} × 4.184`,
            "j-cal": (v) => `${v} / 4.184`
        }
    },
    speed: {
        units: {
            kmh: 1,
            mph: 1.60934,
            ms: 3.6,
            knot: 1.852
        },
        formulas: {
            "kmh-mph": (v) => `${v} × 0.621371`,
            "mph-kmh": (v) => `${v} × 1.60934`,
            "ms-kmh": (v) => `${v} × 3.6`,
            "kmh-ms": (v) => `${v} / 3.6`
        }
    }
};
//
module.exports = {
    data: new SlashCommandBuilder()
        .setName("convert")
        .setNameLocalizations(commandMeta.convert?.name || {})
        .setDescription("Universal conversion tool")
        .setDescriptionLocalizations(commandMeta.convert?.description || {})
        .addSubcommand(sub => sub
            .setName("length")
            .setNameLocalizations(commandMeta.convert?.length_name || {})
            .setDescription("Convert length / distance")
            .setDescriptionLocalizations(commandMeta.convert?.length_description || {})
            .addStringOption(o => o
                .setName("value")
                .setNameLocalizations(commandMeta.convert?.option_value_name || {})
                .setDescription("Value to convert (e.g. 5k, 1m)")
                .setDescriptionLocalizations(commandMeta.convert?.option_value_description || {})
                .setRequired(true))
            .addStringOption(o => o
                .setName("from")
                .setNameLocalizations(commandMeta.convert?.option_from_name || {})
                .setDescription("From unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_from_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Kilometer (km)", value: "km" },
                    { name: "Meter (m)", value: "m" },
                    { name: "Centimeter (cm)", value: "cm" },
                    { name: "Millimeter (mm)", value: "mm" },
                    { name: "Mile (mi)", value: "mi" },
                    { name: "Foot (ft)", value: "ft" },
                    { name: "Inch (in)", value: "in" }
                ))
            .addStringOption(o => o
                .setName("to")
                .setNameLocalizations(commandMeta.convert?.option_to_name || {})
                .setDescription("To unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_to_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Kilometer (km)", value: "km" },
                    { name: "Meter (m)", value: "m" },
                    { name: "Centimeter (cm)", value: "cm" },
                    { name: "Millimeter (mm)", value: "mm" },
                    { name: "Mile (mi)", value: "mi" },
                    { name: "Foot (ft)", value: "ft" },
                    { name: "Inch (in)", value: "in" }
                ))
        )
        .addSubcommand(sub => sub
            .setName("temperature")
            .setNameLocalizations(commandMeta.convert?.temp_name || {})
            .setDescription("Convert temperature")
            .setDescriptionLocalizations(commandMeta.convert?.temp_description || {})
            .addStringOption(o => o
                .setName("value")
                .setNameLocalizations(commandMeta.convert?.option_value_name || {})
                .setDescription("Value to convert")
                .setDescriptionLocalizations(commandMeta.convert?.option_value_description || {})
                .setRequired(true))
            .addStringOption(o => o
                .setName("from")
                .setNameLocalizations(commandMeta.convert?.option_from_name || {})
                .setDescription("From unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_from_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Celsius (°C)", value: "c" },
                    { name: "Fahrenheit (°F)", value: "f" },
                    { name: "Kelvin (K)", value: "k" }
                ))
            .addStringOption(o => o
                .setName("to")
                .setNameLocalizations(commandMeta.convert?.option_to_name || {})
                .setDescription("To unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_to_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Celsius (°C)", value: "c" },
                    { name: "Fahrenheit (°F)", value: "f" },
                    { name: "Kelvin (K)", value: "k" }
                ))
        )
        .addSubcommand(sub => sub
            .setName("mass")
            .setNameLocalizations(commandMeta.convert?.mass_name || {})
            .setDescription("Convert mass / weight")
            .setDescriptionLocalizations(commandMeta.convert?.mass_description || {})
            .addStringOption(o => o
                .setName("value")
                .setNameLocalizations(commandMeta.convert?.option_value_name || {})
                .setDescription("Value to convert")
                .setDescriptionLocalizations(commandMeta.convert?.option_value_description || {})
                .setRequired(true))
            .addStringOption(o => o
                .setName("from")
                .setNameLocalizations(commandMeta.convert?.option_from_name || {})
                .setDescription("From unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_from_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Kilogram (kg)", value: "kg" },
                    { name: "Gram (g)", value: "g" },
                    { name: "Milligram (mg)", value: "mg" },
                    { name: "Pound (lb)", value: "lb" },
                    { name: "Ounce (oz)", value: "oz" },
                    { name: "Metric Ton (t)", value: "ton" }
                ))
            .addStringOption(o => o
                .setName("to")
                .setNameLocalizations(commandMeta.convert?.option_to_name || {})
                .setDescription("To unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_to_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Kilogram (kg)", value: "kg" },
                    { name: "Gram (g)", value: "g" },
                    { name: "Milligram (mg)", value: "mg" },
                    { name: "Pound (lb)", value: "lb" },
                    { name: "Ounce (oz)", value: "oz" },
                    { name: "Metric Ton (t)", value: "ton" }
                ))
        )
        .addSubcommand(sub => sub
            .setName("data")
            .setNameLocalizations(commandMeta.convert?.data_name || {})
            .setDescription("Convert data / file size")
            .setDescriptionLocalizations(commandMeta.convert?.data_description || {})
            .addStringOption(o => o
                .setName("value")
                .setNameLocalizations(commandMeta.convert?.option_value_name || {})
                .setDescription("Value to convert")
                .setDescriptionLocalizations(commandMeta.convert?.option_value_description || {})
                .setRequired(true))
            .addStringOption(o => o
                .setName("from")
                .setNameLocalizations(commandMeta.convert?.option_from_name || {})
                .setDescription("From unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_from_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Bytes (B)", value: "b" },
                    { name: "Kilobytes (KB)", value: "kb" },
                    { name: "Megabytes (MB)", value: "mb" },
                    { name: "Gigabytes (GB)", value: "gb" },
                    { name: "Terabytes (TB)", value: "tb" }
                ))
            .addStringOption(o => o
                .setName("to")
                .setNameLocalizations(commandMeta.convert?.option_to_name || {})
                .setDescription("To unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_to_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Bytes (B)", value: "b" },
                    { name: "Kilobytes (KB)", value: "kb" },
                    { name: "Megabytes (MB)", value: "mb" },
                    { name: "Gigabytes (GB)", value: "gb" },
                    { name: "Terabytes (TB)", value: "tb" }
                ))
            .addStringOption(o => o
                .setName("mode")
                .setNameLocalizations(commandMeta.convert?.option_mode_name || {})
                .setDescription("Data mode")
                .setDescriptionLocalizations(commandMeta.convert?.option_mode_description || {})
                .addChoices(
                    { name: "Binary (1024)", value: "binary" },
                    { name: "Decimal (1000)", value: "decimal" }
                ))
        )
        .addSubcommand(sub => sub
            .setName("currency")
            .setNameLocalizations(commandMeta.convert?.currency_name || {})
            .setDescription("Convert currencies")
            .setDescriptionLocalizations(commandMeta.convert?.currency_description || {})
            .addStringOption(o => o
                .setName("amount")
                .setNameLocalizations(commandMeta.convert?.option_amount_name || {})
                .setDescription("Amount to convert")
                .setDescriptionLocalizations(commandMeta.convert?.option_amount_description || {})
                .setRequired(true))
            .addStringOption(o => o
                .setName("from")
                .setNameLocalizations(commandMeta.convert?.option_from_name || {})
                .setDescription("From currency (e.g. USD)")
                .setDescriptionLocalizations(commandMeta.convert?.option_from_description || {})
                .setRequired(true).setMaxLength(3).setAutocomplete(true))
            .addStringOption(o => o
                .setName("to")
                .setNameLocalizations(commandMeta.convert?.option_to_name || {})
                .setDescription("To currency (e.g. EUR)")
                .setDescriptionLocalizations(commandMeta.convert?.option_to_description || {})
                .setRequired(true).setMaxLength(3).setAutocomplete(true))
        )
        .addSubcommand(sub => sub
            .setName("time")
            .setNameLocalizations(commandMeta.convert?.time_name || {})
            .setDescription("Convert time between timezones")
            .setDescriptionLocalizations(commandMeta.convert?.time_description || {})
            .addStringOption(o => o
                .setName("source_tz")
                .setNameLocalizations(commandMeta.convert?.option_source_tz_name || {})
                .setDescription("Source timezone (e.g. UTC, EST, Tokyo)")
                .setDescriptionLocalizations(commandMeta.convert?.option_source_tz_description || {})
                .setRequired(true)
                .setAutocomplete(true))
            .addStringOption(o => o
                .setName("target_tz")
                .setNameLocalizations(commandMeta.convert?.option_target_tz_name || {})
                .setDescription("Target timezone (e.g. PST, London)")
                .setDescriptionLocalizations(commandMeta.convert?.option_target_tz_description || {})
                .setRequired(true)
                .setAutocomplete(true))
            .addStringOption(o => o
                .setName("time")
                .setNameLocalizations(commandMeta.convert?.option_time_name || {})
                .setDescription("Time (e.g. 15:00, 2024-05-20 10:00)")
                .setDescriptionLocalizations(commandMeta.convert?.option_time_description || {}))
        )
        .addSubcommand(sub => sub
            .setName("unix")
            .setNameLocalizations(commandMeta.convert?.unix_name || {})
            .setDescription("Convert dates to Unix timestamps and vice-versa")
            .setDescriptionLocalizations(commandMeta.convert?.unix_description || {})
            .addStringOption(o => o
                .setName("query")
                .setNameLocalizations(commandMeta.convert?.option_query_name || {})
                .setDescription("Date or timestamp")
                .setDescriptionLocalizations(commandMeta.convert?.option_query_description || {})
                .setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName("area")
            .setNameLocalizations(commandMeta.convert?.area_name || {})
            .setDescription("Convert area")
            .setDescriptionLocalizations(commandMeta.convert?.area_description || {})
            .addStringOption(o => o
                .setName("value")
                .setNameLocalizations(commandMeta.convert?.option_value_name || {})
                .setDescription("Value to convert")
                .setDescriptionLocalizations(commandMeta.convert?.option_value_description || {})
                .setRequired(true))
            .addStringOption(o => o
                .setName("from")
                .setNameLocalizations(commandMeta.convert?.option_from_name || {})
                .setDescription("From unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_from_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Square Meter (m²)", value: "m2" },
                    { name: "Square Kilometer (km²)", value: "km2" },
                    { name: "Square Foot (ft²)", value: "ft2" },
                    { name: "Square Mile (mi²)", value: "mi2" },
                    { name: "Acre", value: "acre" },
                    { name: "Hectare (ha)", value: "ha" }
                ))
            .addStringOption(o => o
                .setName("to")
                .setNameLocalizations(commandMeta.convert?.option_to_name || {})
                .setDescription("To unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_to_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Square Meter (m²)", value: "m2" },
                    { name: "Square Kilometer (km²)", value: "km2" },
                    { name: "Square Foot (ft²)", value: "ft2" },
                    { name: "Square Mile (mi²)", value: "mi2" },
                    { name: "Acre", value: "acre" },
                    { name: "Hectare (ha)", value: "ha" }
                ))
        )
        .addSubcommand(sub => sub
            .setName("volume")
            .setNameLocalizations(commandMeta.convert?.volume_name || {})
            .setDescription("Convert volume")
            .setDescriptionLocalizations(commandMeta.convert?.volume_description || {})
            .addStringOption(o => o
                .setName("value")
                .setNameLocalizations(commandMeta.convert?.option_value_name || {})
                .setDescription("Value to convert")
                .setDescriptionLocalizations(commandMeta.convert?.option_value_description || {})
                .setRequired(true))
            .addStringOption(o => o
                .setName("from")
                .setNameLocalizations(commandMeta.convert?.option_from_name || {})
                .setDescription("From unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_from_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Liter (L)", value: "l" },
                    { name: "Milliliter (mL)", value: "ml" },
                    { name: "Gallon (gal)", value: "gal" },
                    { name: "Ounce (oz)", value: "oz" },
                    { name: "Cup", value: "cup" }
                ))
            .addStringOption(o => o
                .setName("to")
                .setNameLocalizations(commandMeta.convert?.option_to_name || {})
                .setDescription("To unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_to_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Liter (L)", value: "l" },
                    { name: "Milliliter (mL)", value: "ml" },
                    { name: "Gallon (gal)", value: "gal" },
                    { name: "Ounce (oz)", value: "oz" },
                    { name: "Cup", value: "cup" }
                ))
        )
        .addSubcommand(sub => sub
            .setName("power")
            .setNameLocalizations(commandMeta.convert?.power_name || {})
            .setDescription("Convert power & energy")
            .setDescriptionLocalizations(commandMeta.convert?.power_description || {})
            .addStringOption(o => o
                .setName("value")
                .setNameLocalizations(commandMeta.convert?.option_value_name || {})
                .setDescription("Value to convert")
                .setDescriptionLocalizations(commandMeta.convert?.option_value_description || {})
                .setRequired(true))
            .addStringOption(o => o
                .setName("from")
                .setNameLocalizations(commandMeta.convert?.option_from_name || {})
                .setDescription("From unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_from_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Watt (W)", value: "w" },
                    { name: "Kilowatt (kW)", value: "kw" },
                    { name: "Horsepower (hp)", value: "hp" },
                    { name: "Joule (J)", value: "j" },
                    { name: "Kilowatt-hour (kWh)", value: "kwh" },
                    { name: "Calorie (cal)", value: "cal" }
                ))
            .addStringOption(o => o
                .setName("to")
                .setNameLocalizations(commandMeta.convert?.option_to_name || {})
                .setDescription("To unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_to_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "Watt (W)", value: "w" },
                    { name: "Kilowatt (kW)", value: "kw" },
                    { name: "Horsepower (hp)", value: "hp" },
                    { name: "Joule (J)", value: "j" },
                    { name: "Kilowatt-hour (kWh)", value: "kwh" },
                    { name: "Calorie (cal)", value: "cal" }
                ))
        )
        .addSubcommand(sub => sub
            .setName("speed")
            .setNameLocalizations(commandMeta.convert?.speed_name || {})
            .setDescription("Convert speed")
            .setDescriptionLocalizations(commandMeta.convert?.speed_description || {})
            .addStringOption(o => o
                .setName("value")
                .setNameLocalizations(commandMeta.convert?.option_value_name || {})
                .setDescription("Value to convert")
                .setDescriptionLocalizations(commandMeta.convert?.option_value_description || {})
                .setRequired(true))
            .addStringOption(o => o
                .setName("from")
                .setNameLocalizations(commandMeta.convert?.option_from_name || {})
                .setDescription("From unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_from_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "km/h", value: "kmh" },
                    { name: "mph", value: "mph" },
                    { name: "m/s", value: "ms" },
                    { name: "knot", value: "knot" }
                ))
            .addStringOption(o => o
                .setName("to")
                .setNameLocalizations(commandMeta.convert?.option_to_name || {})
                .setDescription("To unit")
                .setDescriptionLocalizations(commandMeta.convert?.option_to_description || {})
                .setRequired(true)
                .addChoices(
                    { name: "km/h", value: "kmh" },
                    { name: "mph", value: "mph" },
                    { name: "m/s", value: "ms" },
                    { name: "knot", value: "knot" }
                ))
        ),
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    dev: false,
    mod: false,
    beta: false,
    explicit: false,
    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === "source_tz" || focusedOption.name === "target_tz") {
            const timezones = [
                "UTC", "GMT", "EST", "EDT", "CST", "CDT", "MST", "MDT", "PST", "PDT",
                "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Rome", "Europe/Madrid", "Europe/Moscow",
                "Asia/Tokyo", "Asia/Shanghai", "Asia/Dubai", "Asia/Singapore", "Asia/Seoul", "Asia/Kolkata",
                "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo", "America/Mexico_City",
                "Australia/Sydney", "Australia/Melbourne", "Australia/Perth", "Pacific/Auckland"
            ];
            const filtered = timezones.filter(tz => tz.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
            return interaction.respond(filtered.map(tz => ({ name: tz, value: tz })));
        }

        if (focusedOption.name === "from" || focusedOption.name === "to") {
            const subcommand = interaction.options.getSubcommand(false);
            if (subcommand === "currency") {
                const rates = currencyCache.rates || await getCurrencyRates(console);
                if (!rates) return interaction.respond([]);
                const currencies = Object.keys(rates);
                const filtered = currencies.filter(c => c.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
                return interaction.respond(filtered.map(c => ({ name: c, value: c })));
            }
        }
    },
    async execute(bot, interaction, funcs, settings, logger, t) {
        try {
            const subcommand = interaction.options.getSubcommand();
            const container = new ContainerBuilder().setAccentColor(0x3498db);

            if (["length", "mass", "area", "volume", "power", "speed"].includes(subcommand)) {
                return this.handleUnitConversion(interaction, subcommand, t, container, funcs);
            }

            if (subcommand === "temperature") {
                return this.handleTempConversion(interaction, t, container, funcs);
            }

            if (subcommand === "data") {
                return this.handleDataConversion(interaction, t, container, funcs);
            }

            if (subcommand === "currency") {
                return this.handleCurrencyConversion(interaction, logger, t, container, funcs);
            }

            if (subcommand === "time") {
                return this.handleTimeConversion(interaction, t, container);
            }

            if (subcommand === "unix") {
                return this.handleUnixConversion(interaction, t, container);
            }

        } catch (error) {
            logger.error("[/CONVERT] Error executing command:", error);
            return interaction.reply({ content: `${e.pixel_cross} ${t("common:error")}`, flags: MessageFlags.Ephemeral });
        }
    },
    handleUnitConversion(interaction, category, t, container, funcs) {
        const valueInput = interaction.options.getString("value");
        const value = funcs.parseAbbr(valueInput);
        const from = interaction.options.getString("from");
        const to = interaction.options.getString("to");

        const config = CONVERSIONS[category];
        const baseValue = value * config.units[from];
        const result = baseValue / config.units[to];

        const formulaFunc = config.formulas[`${from}-${to}`] || config.formulas[`${to}-${from}`];
        let formulaDisplay = "N/A";

        if (config.formulas[`${from}-${to}`]) {
            formulaDisplay = config.formulas[`${from}-${to}`](from);
        } else if (config.formulas[`${to}-${from}`]) {
            formulaDisplay = `${to} / factor`;
        } else {
            formulaDisplay = `${from} × (${config.units[from]}/${config.units[to]})`;
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${e.settings_cog_blue} ${t("commands:convert.result_title")}`),
            new TextDisplayBuilder().setContent(`**${funcs.abbr(value)} ${from}** → **${funcs.abbr(result)} ${to}**`)
        );

        if (result >= 1e8) {
            const isUnreadable = result > 1e21 || !isFinite(result);
            const rawButton = new ButtonBuilder()
                .setCustomId(isUnreadable ? `convert_raw_${interaction.user.id}_unreadable` : `convert_raw_${interaction.user.id}_${result.toFixed(4)}_${to}`)
                .setLabel(isUnreadable ? t("commands:convert.result_too_large") : t("commands:convert.show_raw"))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(isUnreadable);

            container.addActionRowComponents(new ActionRowBuilder().addComponents(rawButton));
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${t("commands:convert.formula")}\n\`\`\`\n${to} = ${formulaDisplay}\n\`\`\``)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder()
                .setSpacing(SeparatorSpacingSize.Small)
                .setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Waterfall - Convert"));

        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    handleTempConversion(interaction, t, container, funcs) {
        const valueInput = interaction.options.getString("value");
        const value = funcs.parseAbbr(valueInput);
        const from = interaction.options.getString("from");
        const to = interaction.options.getString("to");

        let result;
        let formula;

        if (from === to) {
            result = value;
            formula = `${to} = ${from}`;
        } else if (from === "c" && to === "f") {
            result = (value * 9 / 5) + 32;
            formula = "°F = (°C × 9/5) + 32";
        } else if (from === "f" && to === "c") {
            result = (value - 32) * 5 / 9;
            formula = "°C = (°F - 32) × 5/9";
        } else if (from === "c" && to === "k") {
            result = value + 273.15;
            formula = "K = °C + 273.15";
        } else if (from === "k" && to === "c") {
            result = value - 273.15;
            formula = "°C = K - 273.15";
        } else if (from === "f" && to === "k") {
            result = (value - 32) * 5 / 9 + 273.15;
            formula = "K = (°F - 32) × 5/9 + 273.15";
        } else if (from === "k" && to === "f") {
            result = (value - 273.15) * 9 / 5 + 32;
            formula = "°F = (K - 273.15) × 9/5 + 32";
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${e.settings_cog_blue} ${t("commands:convert.result_title")}`),
            new TextDisplayBuilder().setContent(`**${funcs.abbr(value)}°${from.toUpperCase()}** → **${funcs.abbr(result)}°${to.toUpperCase()}**`)
        );

        if (result >= 1e8) {
            const isUnreadable = result > 1e21 || !isFinite(result);
            const rawButton = new ButtonBuilder()
                .setCustomId(isUnreadable ? `convert_raw_${interaction.user.id}_unreadable` : `convert_raw_${interaction.user.id}_${result.toFixed(4)}_${to.toUpperCase()}`)
                .setLabel(isUnreadable ? t("commands:convert.result_too_large") : t("commands:convert.show_raw"))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(isUnreadable);

            container.addActionRowComponents(new ActionRowBuilder().addComponents(rawButton));
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${t("commands:convert.formula")}\n\`\`\`\n${formula}\n\`\`\``)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder()
                .setSpacing(SeparatorSpacingSize.Small)
                .setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Waterfall - Convert"));

        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    handleDataConversion(interaction, t, container, funcs) {
        const valueInput = interaction.options.getString("value");
        const value = funcs.parseAbbr(valueInput);
        const from = interaction.options.getString("from");
        const to = interaction.options.getString("to");
        const mode = interaction.options.getString("mode") || "binary";

        const factor = mode === "binary" ? 1024 : 1000;
        const units = ["b", "kb", "mb", "gb", "tb"];
        const fromIdx = units.indexOf(from);
        const toIdx = units.indexOf(to);

        const result = value * Math.pow(factor, fromIdx - toIdx);
        const formula = `${to.toUpperCase()} = ${from.toUpperCase()} × ${factor}^(${fromIdx} - ${toIdx})`;

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${e.settings_cog_blue} ${t("commands:convert.result_title")}`),
            new TextDisplayBuilder().setContent(`**${funcs.abbr(value)} ${from.toUpperCase()}** → **${funcs.abbr(result)} ${to.toUpperCase()}**`),
            new TextDisplayBuilder().setContent(`-# ${mode === "binary" ? t("commands:convert.binary") : t("commands:convert.decimal")}`)
        );

        if (result >= 1e8) {
            const isUnreadable = result > 1e21 || !isFinite(result);
            const rawButton = new ButtonBuilder()
                .setCustomId(isUnreadable ? `convert_raw_${interaction.user.id}_unreadable` : `convert_raw_${interaction.user.id}_${result.toFixed(6)}_${to.toUpperCase()}`)
                .setLabel(isUnreadable ? t("commands:convert.result_too_large") : t("commands:convert.show_raw"))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(isUnreadable);

            container.addActionRowComponents(new ActionRowBuilder().addComponents(rawButton));
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${t("commands:convert.formula")}\n\`\`\`\n${formula}\n\`\`\``)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder()
                .setSpacing(SeparatorSpacingSize.Small)
                .setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Waterfall - Convert"));

        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    async handleCurrencyConversion(interaction, logger, t, container, funcs) {
        const amountInput = interaction.options.getString("amount");
        const amount = funcs.parseAbbr(amountInput);
        const from = interaction.options.getString("from").toUpperCase();
        const to = interaction.options.getString("to").toUpperCase();

        await interaction.deferReply();

        const rates = await getCurrencyRates(logger);
        if (!rates || !rates[from] || !rates[to]) {
            return interaction.editReply({ content: `${e.pixel_cross} ${t("commands:convert.error_currency_fetch")}` });
        }

        const result = (amount / rates[from]) * rates[to];
        const updatedUnix = Math.floor(currencyCache.lastUpdate / 1000);

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${e.settings_cog_blue} ${t("commands:convert.result_title")}`),
            new TextDisplayBuilder().setContent(`**${funcs.abbr(amount)} ${from}** → **${funcs.abbr(result)} ${to}**`),
            new TextDisplayBuilder().setContent(`-# ${t("commands:convert.rate_source", { time: `<t:${updatedUnix}:R>` })}`)
        );

        if (result >= 1e8) {
            const isUnreadable = result > 1e21 || !isFinite(result);
            const rawButton = new ButtonBuilder()
                .setCustomId(isUnreadable ? `convert_raw_${interaction.user.id}_unreadable` : `convert_raw_${interaction.user.id}_${result.toFixed(2)}_${to}`)
                .setLabel(isUnreadable ? t("commands:convert.result_too_large") : t("commands:convert.show_raw"))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(isUnreadable);

            container.addActionRowComponents(new ActionRowBuilder().addComponents(rawButton));
        }

        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${t("commands:convert.formula")}\n\`\`\`\n${to} = ${amount} ${from} × (rate_${to} / rate_${from})\n\`\`\``)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder()
                .setSpacing(SeparatorSpacingSize.Small)
                .setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Waterfall - Convert"));

        return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    handleTimeConversion(interaction, t, container) {
        const sourceTz = interaction.options.getString("source_tz");
        const targetTz = interaction.options.getString("target_tz");
        const timeInput = interaction.options.getString("time");

        try {
            if (!moment.tz.zone(sourceTz) || !moment.tz.zone(targetTz)) {
                throw new Error("Invalid format");
            }

            const sourceMoment = timeInput ? moment.tz(timeInput, ["h:mm A", "H:mm", "YYYY-MM-DD HH:mm"], sourceTz) : moment.tz(sourceTz);
            if (!sourceMoment.isValid()) throw new Error("Invalid time");

            const targetMoment = sourceMoment.clone().tz(targetTz);
            const unix = Math.floor(sourceMoment.valueOf() / 1000);

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# ${e.calendar} ${t("commands:convert.converted_time")}`),
                new TextDisplayBuilder().setContent(`**${sourceTz}** → **${targetTz}**`),
                new TextDisplayBuilder().setContent(`\n**${t("commands:convert.local_time")}**\n${targetMoment.format("LLLL")}`),
                new TextDisplayBuilder().setContent(`\n**Discord Timestamps:**\n<t:${unix}:f>\n<t:${unix}:R>\n\n**Raw Tags:**\n\`\`\`\n<t:${unix}:d>\n<t:${unix}:t>\n<t:${unix}:f>\n<t:${unix}:R>\n\`\`\``)
            );

            container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${t("commands:convert.formula")}\n\`\`\`\nlocal_time = unix_time + timezone_offset\n\`\`\``)
            )
                .addSeparatorComponents(
                    new SeparatorBuilder()
                        .setSpacing(SeparatorSpacingSize.Small)
                        .setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Waterfall - Convert"));

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        } catch (err) {
            return interaction.reply({ content: `${e.pixel_cross} ${t("commands:convert.error_timezone", { tz: sourceTz + "/" + targetTz })}`, flags: MessageFlags.Ephemeral });
        }
    },

    handleUnixConversion(interaction, t, container) {
        const query = interaction.options.getString("query");
        let date;

        if (/^\d+$/.test(query)) {
            const ts = parseInt(query);
            date = ts > 10000000000 ? new Date(ts) : new Date(ts * 1000);
        } else {
            date = new Date(query);
        }

        if (isNaN(date.getTime())) {
            return interaction.reply({ content: `${e.pixel_cross} ${t("commands:convert.error_unix")}`, flags: MessageFlags.Ephemeral });
        }

        const unix = Math.floor(date.getTime() / 1000);

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# ${e.settings_cog_blue} Unix Tools`),
            new TextDisplayBuilder().setContent(`**${t("commands:convert.unix_label")}** \`${unix}\``),
            new TextDisplayBuilder().setContent(`\n**${t("commands:convert.formats_label")}**\n<t:${unix}:d> → Date\n<t:${unix}:t> → Time\n<t:${unix}:f> → Full\n<t:${unix}:R> → Relative\n\n**Raw Tags:**\n\`\`\`\n<t:${unix}:d>\n<t:${unix}:t>\n<t:${unix}:f>\n<t:${unix}:R>\n\`\`\``)
        )
            .addSeparatorComponents(
                new SeparatorBuilder()
                    .setSpacing(SeparatorSpacingSize.Small)
                    .setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("-# Waterfall - Convert"));

        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    },
    help: {
        name: "convert",
        description: "Universal conversion tool for units, time, currency and more",
        category: "Utility",
        permissions: [],
        botPermissions: [],
        created: 1766392414
    }
};
