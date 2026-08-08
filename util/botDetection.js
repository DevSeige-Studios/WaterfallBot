const { GlobalUserInfractions, BotDetectionSettings, NewUserTracking, ActiveUserStatus } = require("../schemas/botDetection.js");
const { Server } = require("../schemas/servers.js");
const logger = require("../logger.js");
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const ACTIVE_CACHE_TTL = 10 * 60 * 1000;
const MESSAGE_UPDATE_THROTTLE = 60 * 60 * 1000;
const ACTIVE_CONFIDENCE_THRESHOLD = 46;

const SUSPICIOUS_PATTERNS = [
    /^[a-z]{2,4}\d{4,}$/i,
    /^user\d+$/i,
    /^[a-z]+_[a-z]+\d+$/i,
    /^[a-z]{1,3}[0-9]{5,}$/i,
    /discord.*nitro/i,
    /free.*gift/i,
    /claim.*reward/i,
    /^[a-z]{8,}$/i
];

const SUSPICIOUS_DISPLAY_PATTERNS = [
    /free\s*nitro/i,
    /discord\s*gift/i,
    /claim\s*(your|now|here)/i,
    /steam\s*gift/i,
    /giveaway/i,
    /airdrop/i,
    /crypto\s*(gift|free)/i,
    /nft\s*(free|mint)/i
];

const TRUSTED_DOMAINS = [
    'youtube.com', 'youtu.be',
    'twitter.com', 'x.com',
    'github.com', 'gitlab.com',
    'reddit.com',
    'twitch.tv',
    'spotify.com',
    'steam.com', 'steampowered.com',
    'imgur.com',
    'tenor.com', 'giphy.com',
    'wikipedia.org',
    'google.com', 'docs.google.com', 'drive.google.com'
];

const SUSPICIOUS_URL_PATTERNS = [
    /discord.*nitro/i,
    /free.*nitro/i,
    /steam.*gift/i,
    /claim.*reward/i,
    /airdrop/i,
    /crypto.*gift/i,
    /nft.*mint/i,
    /giveaway.*free/i,
    /earn.*money/i,
    /click.*here.*free/i,
    /\.(ru|cn|tk|ml|ga|cf|gq|xyz|top|buzz|click|link)\//i,
    /bit\.ly|tinyurl|is\.gd|t\.co.*[^a-zA-Z]/i,
    /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
];

const linkSpamTracker = new Map();
const firstMessageTracker = new Map();
const settingsCache = new Map();
const activeUserCache = new Map();
const lastMessageUpdateTracker = new Map();

async function getSettings(serverID) {
    const cached = settingsCache.get(serverID);
    if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
        return cached.data;
    }

    try {
        let settings = await BotDetectionSettings.findOne({ serverID }).lean();
        settingsCache.set(serverID, { data: settings, timestamp: Date.now() });

        if (!settings) {
            return null;
        }
        return settings;
    } catch (error) {
        logger.error(`[BotDetection] Error fetching settings for ${serverID}:`, error);
        return null;
    }
}

async function saveSettings(serverID, updates) {
    try {
        const updated = await BotDetectionSettings.findOneAndUpdate(
            { serverID },
            { $set: updates },
            { upsert: true, new: true }
        );
        settingsCache.set(serverID, { data: updated.toObject ? updated.toObject() : updated, timestamp: Date.now() });
        return updated;
    } catch (error) {
        logger.error(`[BotDetection] Error saving settings for ${serverID}:`, error);
        return null;
    }
}

function calculateConfidence(member, settings) {
    let confidence = 0;
    const reasons = [];
    const checks = settings.checks || {};

    if (checks.defaultAvatar !== false && !member.user.avatar) {
        confidence += 15;
        reasons.push('default_avatar');
    }

    const accountAge = Date.now() - member.user.createdTimestamp;
    const TEN_MINUTES = 10 * 60 * 1000;
    const ONE_HOUR = 60 * 60 * 1000;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
    const FOUR_WEEKS = 28 * 24 * 60 * 60 * 1000;

    if (checks.accountAge10m !== false && accountAge < TEN_MINUTES) {
        confidence += 30;
        reasons.push('account_age_10m');
    } else if (checks.accountAge1h !== false && accountAge < ONE_HOUR) {
        confidence += 20;
        reasons.push('account_age_1h');
    } else if (checks.accountAge1d !== false && accountAge < ONE_DAY) {
        confidence += 10;
        reasons.push('account_age_1d');
    } else if (checks.accountAge1w && accountAge < ONE_WEEK) {
        confidence += 5;
        reasons.push('account_age_1w');
    } else if (checks.accountAge2w && accountAge < TWO_WEEKS) {
        confidence += 3;
        reasons.push('account_age_2w');
    } else if (checks.accountAge4w && accountAge < FOUR_WEEKS) {
        confidence += 2;
        reasons.push('account_age_4w');
    }

    if (checks.suspiciousUsername !== false) {
        const username = member.user.username.toLowerCase();
        for (const pattern of SUSPICIOUS_PATTERNS) {
            if (pattern.test(username)) {
                confidence += 15;
                reasons.push('suspicious_username');
                break;
            }
        }

        const displayName = member.displayName || member.user.displayName || '';
        for (const pattern of SUSPICIOUS_DISPLAY_PATTERNS) {
            if (pattern.test(displayName)) {
                confidence += 10;
                reasons.push('suspicious_display_name');
                break;
            }
        }
    }

    logger.debug(`[BotDetection] Calculated confidence for ${member.user.id}: ${Math.min(confidence, 100)}% (Reasons: ${reasons.join(', ')})`);
    return { confidence: Math.min(confidence, 100), reasons };
}

async function addGlobalInfractionFactor(userID, baseConfidence) {
    try {
        const globalData = await GlobalUserInfractions.findOne({ userID }).lean();
        if (!globalData) return { confidence: baseConfidence, globalCount: 0 };

        let addition = 0;
        if (globalData.infractionCount >= 8) {
            addition = 20;
        } else if (globalData.infractionCount >= 4) {
            addition = 10;
        } else if (globalData.infractionCount >= 1) {
            addition = 5;
        }

        if (addition > 0) {
            logger.debug(`[BotDetection] Added ${addition}% confidence from ${globalData.infractionCount} global infractions for user ${userID}`);
        }

        return {
            confidence: Math.min(baseConfidence + addition, 100),
            globalCount: globalData.infractionCount
        };
    } catch (error) {
        logger.error(`[BotDetection] Error fetching global infractions:`, error);
        return { confidence: baseConfidence, globalCount: 0 };
    }
}

function getActionFromConfidence(confidence, settings) {
    if (confidence < 50) {
        return { action: 'log', duration: 0 };
    }

    if (confidence >= 94.5 && settings.allowKick) {
        return { action: 'kick', duration: 0 };
    }

    if (!settings.allowTimeout) {
        return { action: 'log', duration: 0 };
    }

    if (confidence >= 90) {
        return { action: 'timeout', duration: 24 * 60 * 60 * 1000 };
    } else if (confidence >= 80) {
        return { action: 'timeout', duration: 12 * 60 * 60 * 1000 };
    } else if (confidence >= 65) {
        return { action: 'timeout', duration: 60 * 60 * 1000 };
    } else if (confidence >= 55) {
        return { action: 'timeout', duration: 30 * 60 * 1000 };
    } else {
        return { action: 'timeout', duration: 60 * 1000 };
    }
}

async function checkAltEvasion(member, serverData) {
    const result = {
        isLikelyAlt: false,
        potentialAlts: []
    };

    if (!serverData?.recentBans?.length) {
        return result;
    }

    const accountCreated = member.user.createdTimestamp;
    const joinedAt = member.joinedTimestamp || Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    for (const ban of serverData.recentBans) {
        const banTime = new Date(ban.bannedAt).getTime();
        const timeSinceBan = Date.now() - banTime;

        if (timeSinceBan > SEVEN_DAYS) continue;

        if (accountCreated > banTime) {
            result.potentialAlts.push({
                userID: ban.userID,
                bannedAt: ban.bannedAt,
                reason: 'Account created after ban'
            });
            continue;
        }

        if (joinedAt - banTime < ONE_DAY && timeSinceBan < ONE_DAY) {
            result.potentialAlts.push({
                userID: ban.userID,
                bannedAt: ban.bannedAt,
                reason: 'Joined shortly after ban'
            });
        }
    }

    if (result.potentialAlts.length > 0) {
        result.isLikelyAlt = true;
        result.potentialAlts = result.potentialAlts.filter((v, i, a) => a.findIndex(t => t.userID === v.userID) === i);
        logger.debug(`[BotDetection] Alt check for ${member.user.id}: Found ${result.potentialAlts.length} potential matches.`);
    }

    return result;
}

async function isQualifiedServer(serverData, guild) {
    try {
        if (!guild.features.includes('COMMUNITY')) {
            return false;
        }

        const stats = serverData?.memberStats;
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;

        if (stats?.lastUpdated && (now - new Date(stats.lastUpdated).getTime()) < ONE_HOUR) {
            const totalMembers = stats.totalMembers || 0;
            const botCount = stats.botCount || 0;
            const humanRatio = totalMembers > 0 ? (totalMembers - botCount) / totalMembers : 0;
            const messageCount = stats.messageCount30d || 0;

            return totalMembers >= 1000 && humanRatio >= 0.93 && messageCount >= 100;
        }

        const memberCount = guild.memberCount || 0;
        const approximateBots = guild.members.cache.filter(m => m.user.bot).size;
        const approximateHumanRatio = memberCount > 0 ? (memberCount - approximateBots) / memberCount : 0;

        return memberCount >= 1000 && approximateHumanRatio >= 0.93;
    } catch (error) {
        logger.error(`[BotDetection] Error checking server qualification:`, error);
        return false;
    }
}

async function trackGlobalInfraction(userID, serverID, serverData, guild) {
    try {
        const qualified = await isQualifiedServer(serverData, guild);
        if (!qualified) return;

        await GlobalUserInfractions.findOneAndUpdate(
            { userID },
            {
                $addToSet: { servers: serverID },
                $inc: { infractionCount: 1 },
                $set: { lastInfraction: new Date(), timestamp: new Date() }
            },
            { upsert: true }
        );
        logger.debug(`[BotDetection] Tracked global infraction for ${userID} from server ${serverID}`);
    } catch (error) {
        logger.error(`[BotDetection] Error tracking global infraction:`, error);
    }
}

async function createTracking(serverID, userID) {
    try {
        return await NewUserTracking.findOneAndUpdate(
            { serverID, userID },
            {
                $setOnInsert: {
                    serverID,
                    userID,
                    joinedAt: new Date(),
                    messageCount: 0,
                    linksSent: 0,
                    mentionCount: 0,
                    channelsUsed: [],
                    channelTimestamps: [],
                    similarMessages: [],
                    firstMessage: {
                        sent: false,
                        hadLinks: false,
                        hadAttachments: false,
                        hadSuspiciousLinks: false,
                        linkCount: 0,
                        attachmentCount: 0
                    },
                    analyzed: false,
                    timestamp: new Date()
                }
            },
            { upsert: true, new: true }
        );
    } catch (error) {
        logger.error(`[BotDetection] Error creating tracking:`, error);
        return null;
    }
}

async function updateTracking(serverID, userID, messageData) {
    try {
        const existing = await NewUserTracking.findOne({ serverID, userID, analyzed: false }).lean();

        const update = {
            $inc: {
                messageCount: 1,
                linksSent: messageData.linksCount || 0,
                mentionCount: messageData.mentionCount || 0
            },
            $addToSet: {},
            $push: {}
        };

        if (messageData.channelID) {
            update.$addToSet.channelsUsed = messageData.channelID;
            update.$push.channelTimestamps = {
                $each: [{ channelID: messageData.channelID, timestamp: new Date() }],
                $slice: -50
            };
        }

        if (messageData.contentHash) {
            if (update.$push) {
                update.$push.similarMessages = {
                    $each: [messageData.contentHash],
                    $slice: -20
                };
            } else {
                update.$push = {
                    similarMessages: {
                        $each: [messageData.contentHash],
                        $slice: -20
                    }
                };
            }
        }

        if (existing && !existing.firstMessage?.sent) {
            update.$set = {
                'firstMessage.sent': true,
                'firstMessage.hadLinks': (messageData.linksCount || 0) > 0,
                'firstMessage.hadAttachments': messageData.hasAttachments || false,
                'firstMessage.hadSuspiciousLinks': messageData.hasSuspiciousLinks || false,
                'firstMessage.linkCount': messageData.linksCount || 0,
                'firstMessage.attachmentCount': messageData.attachmentCount || 0,
                'firstMessage.timestamp': new Date()
            };
        }

        return await NewUserTracking.findOneAndUpdate(
            { serverID, userID, analyzed: false },
            update,
            { new: true }
        );
    } catch (error) {
        logger.error(`[BotDetection] Error updating tracking:`, error);
        return null;
    }
}

function analyzeMessageBehavior(tracking) {
    let confidence = 0;
    const reasons = [];

    if (!tracking) return { confidence: 0, reasons: [] };

    const duplicates = tracking.similarMessages?.reduce((acc, hash) => {
        acc[hash] = (acc[hash] || 0) + 1;
        return acc;
    }, {}) || {};

    const maxDuplicates = Math.max(...Object.values(duplicates), 0);
    if (maxDuplicates >= 3) {
        confidence += 25;
        reasons.push('duplicate_messages');
    }

    if (tracking.linksSent >= 3 && tracking.messageCount <= 5) {
        confidence += 20;
        reasons.push('excessive_links');
    }

    if (tracking.mentionCount >= 10) {
        confidence += 15;
        reasons.push('mass_mentions');
    }

    const channelCount = tracking.channelsUsed?.length || 0;
    const messageCount = tracking.messageCount || 0;
    if (messageCount >= 5 && channelCount === 1) {
        confidence += 5;
        reasons.push('single_channel');
    }

    const joinedAt = new Date(tracking.joinedAt).getTime();
    const timeSinceJoin = Date.now() - joinedAt;
    const messagesPerMinute = messageCount / (timeSinceJoin / 60000);
    if (messagesPerMinute > 5) {
        confidence += 15;
        reasons.push('rapid_messaging');
    }

    return { confidence: Math.min(confidence, 100), reasons };
}

async function markAnalyzed(serverID, userID) {
    try {
        return await NewUserTracking.findOneAndUpdate(
            { serverID, userID },
            { $set: { analyzed: true } }
        );
    } catch (error) {
        logger.error(`[BotDetection] Error marking analyzed:`, error);
        return null;
    }
}

function getRiskLevel(globalCount) {
    if (globalCount >= 10) return 'severe';
    if (globalCount >= 6) return 'high';
    if (globalCount >= 3) return 'moderate';
    if (globalCount >= 1) return 'low';
    return 'none';
}

async function addRecentBan(serverID, userID) {
    try {
        await Server.findOneAndUpdate(
            { serverID },
            {
                $push: {
                    recentBans: {
                        $each: [{ userID, bannedAt: new Date() }],
                        $slice: -10
                    }
                }
            }
        );
    } catch (error) {
        logger.error(`[BotDetection] Error adding recent ban:`, error);
    }
}

function extractLinks(content) {
    const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
    return content.match(urlRegex) || [];
}

function isLinkTrusted(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.protocol === 'http:') return false;
        const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
        const pathname = urlObj.pathname.toLowerCase();

        if (hostname === 'discord.gg' || hostname === 'discord.me' || hostname === 'discord.io') {
            return false;
        }

        if (hostname === 'discord.com' || hostname.endsWith('.discord.com') ||
            hostname === 'discordapp.com' || hostname.endsWith('.discordapp.com') ||
            hostname === 'discord.net' || hostname.endsWith('.discord.net')) {

            if (hostname.startsWith('cdn.') || hostname.startsWith('media.') || hostname.includes('images-ext-')) {
                return false;
            }

            if (pathname.startsWith('/invite/') || pathname === '/invite') {
                return false;
            }

            return true;
        }

        return TRUSTED_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
    } catch {
        return false;
    }
}

function isSuspiciousLink(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.protocol === 'http:') return true;

        const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
        const pathname = urlObj.pathname.toLowerCase();

        if (hostname === 'discord.gg' || hostname === 'discord.me' || hostname === 'discord.io' ||
            ((hostname === 'discord.com' || hostname === 'discordapp.com') && (pathname.startsWith('/invite/') || pathname === '/invite'))) {
            return true;
        }

        if (isLinkTrusted(url)) {
            return false;
        }

        const fullUrl = url.toLowerCase();
        for (const pattern of SUSPICIOUS_URL_PATTERNS) {
            if (pattern.test(fullUrl) || pattern.test(hostname)) {
                return true;
            }
        }

        if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(hostname)) {
            return true;
        }

        const parts = hostname.split('.');
        const tld = parts[parts.length - 1];
        const sketchyTLDs = ['tk', 'ml', 'ga', 'cf', 'gq', 'xyz', 'top', 'buzz', 'click', 'link', 'cam', 'rest', 'icu'];
        if (sketchyTLDs.includes(tld)) {
            return true;
        }

        return false;
    } catch {
        return true;
    }
}

function analyzeFirstMessage(message) {
    const links = extractLinks(message.content);
    const attachmentCount = message.attachments?.size || 0;
    const hasLinks = links.length > 0;
    const hasAttachments = attachmentCount > 0;

    let confidence = 0;
    const reasons = [];

    if (!hasLinks && !hasAttachments) {
        return { confidence: 0, reasons: [], isFirstMessageSuspicious: false };
    }

    const suspiciousLinks = links.filter(l => isSuspiciousLink(l));
    const hasSuspiciousLinks = suspiciousLinks.length > 0;
    const untrustedLinks = links.filter(l => !isLinkTrusted(l));

    const contentWithoutLinks = message.content.replace(/(https?:\/\/[^\s<>"']+)/gi, '').trim();
    const isLinkOnly = contentWithoutLinks.length < 10;

    if (hasLinks && isLinkOnly) {
        confidence += 10;
        reasons.push('first_msg_link_only');
    }

    if (hasSuspiciousLinks) {
        confidence += 20;
        reasons.push('first_msg_suspicious_links');
    } else if (untrustedLinks.length > 0) {
        confidence += 8;
        reasons.push('first_msg_untrusted_links');
    }

    if (hasAttachments && attachmentCount >= 3) {
        confidence += 12;
        reasons.push('first_msg_many_attachments');
    } else if (hasAttachments) {
        confidence += 5;
        reasons.push('first_msg_has_attachments');
    }

    if (hasLinks && hasAttachments) {
        confidence += 8;
        reasons.push('first_msg_links_and_attachments');
    }

    if (links.length >= 3) {
        confidence += 10;
        reasons.push('first_msg_multiple_links');
    }

    logger.debug(`[BotDetection] First message analysis: confidence +${confidence}%, links=${links.length}, attachments=${attachmentCount}, suspicious=${suspiciousLinks.length}`);
    return { confidence: Math.min(confidence, 50), reasons, isFirstMessageSuspicious: confidence > 0, hasSuspiciousLinks, attachmentCount, linkCount: links.length };
}

function trackLinkMessage(serverID, userID, channelID, messageID, links, isLinkOnly) {
    const key = `${serverID}:${userID}`;
    const now = Date.now();

    if (!linkSpamTracker.has(key)) {
        linkSpamTracker.set(key, []);
    }

    const tracker = linkSpamTracker.get(key);
    tracker.push({
        channelID,
        messageID,
        links,
        isLinkOnly: isLinkOnly || false,
        timestamp: now
    });

    const FIVE_MINUTES = 5 * 60 * 1000;
    const filtered = tracker.filter(entry => (now - entry.timestamp) < FIVE_MINUTES);
    linkSpamTracker.set(key, filtered);

    setTimeout(() => {
        const current = linkSpamTracker.get(key);
        if (current) {
            const stillValid = current.filter(e => (Date.now() - e.timestamp) < FIVE_MINUTES);
            if (stillValid.length === 0) {
                linkSpamTracker.delete(key);
            } else {
                linkSpamTracker.set(key, stillValid);
            }
        }
    }, FIVE_MINUTES + 1000);

    return filtered;
}

async function checkCrossChannelLinkSpam(message, settings) {
    if (!settings?.enabled || !settings?.checks?.crossChannelSpam) {
        return { isSpam: false, confidence: 0, reasons: [] };
    }

    const links = extractLinks(message.content);
    const hasAttachments = message.attachments.size > 0;
    const attachmentCount = message.attachments.size;

    if (links.length === 0 && !hasAttachments) {
        return { isSpam: false, confidence: 0, reasons: [] };
    }

    const contentWithoutLinks = message.content.replace(/(https?:\/\/[^\s<>"']+)/gi, '').trim();
    const isLinkOnly = contentWithoutLinks.length < 10;

    const trackedItems = [...links];
    if (hasAttachments) trackedItems.push('attachment');

    const tracked = trackLinkMessage(
        message.guild.id,
        message.author.id,
        message.channel.id,
        message.id,
        trackedItems,
        isLinkOnly
    );

    const uniqueChannels = new Set(tracked.map(e => e.channelID));
    let confidence = 0;
    const reasons = [];

    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    const isNewUser = member && (Date.now() - member.joinedTimestamp) < 2 * 60 * 60 * 1000;

    const key = `${message.guild.id}:${message.author.id}`;
    const isFirstMessage = !firstMessageTracker.has(key);
    if (isFirstMessage) {
        firstMessageTracker.set(key, Date.now());
        setTimeout(() => firstMessageTracker.delete(key), 2 * 60 * 60 * 1000);
    }

    if (isFirstMessage && isNewUser && settings.checks?.firstMessageAnalysis !== false) {
        const firstMsgResult = analyzeFirstMessage(message);
        if (firstMsgResult.isFirstMessageSuspicious) {
            confidence += firstMsgResult.confidence;
            reasons.push(...firstMsgResult.reasons);
        }
    }

    if (uniqueChannels.size >= 2) {
        const allMessageIDs = tracked.map(e => ({ channelID: e.channelID, messageID: e.messageID }));
        const allLinks = tracked.flatMap(e => e.links);

        confidence += 25;
        reasons.push('cross_channel_spam');
        reasons.push(`${uniqueChannels.size}_channels_within_5min`);

        if (uniqueChannels.size >= 3) {
            confidence += 15;
            reasons.push('3plus_channels_rapid');
        }

        if (uniqueChannels.size >= 5) {
            confidence += 15;
            reasons.push('5plus_channels_blitz');
        }

        const allLinkOnly = tracked.every(e => e.isLinkOnly);
        if (allLinkOnly) {
            confidence += 20;
            reasons.push('all_messages_link_only');
        }

        const allContainLinks = tracked.every(e => e.links.some(l => l !== 'attachment'));
        if (allContainLinks && !allLinkOnly) {
            confidence += 10;
            reasons.push('all_messages_contain_links');
        }

        const suspiciousLinksInSpam = allLinks.filter(l => l !== 'attachment' && isSuspiciousLink(l));
        if (suspiciousLinksInSpam.length > 0) {
            confidence += 15;
            reasons.push('cross_channel_suspicious_links');
        }

        if (hasAttachments) {
            reasons.push('attachments_detected');
            confidence += 5;
        }

        if (isNewUser && isFirstMessage) {
            confidence += 10;
            reasons.push('new_user_first_messages_spam');
        }

        const timeSpan = Math.max(...tracked.map(e => e.timestamp)) - Math.min(...tracked.map(e => e.timestamp));
        if (timeSpan < 60 * 1000 && uniqueChannels.size >= 2) {
            confidence += 10;
            reasons.push('under_1min_multi_channel');
        }

        linkSpamTracker.delete(key);

        const spamResult = {
            isSpam: true,
            confidence: Math.min(confidence, 100),
            channelCount: uniqueChannels.size,
            messageCount: tracked.length,
            messages: allMessageIDs,
            links: [...new Set(allLinks)],
            reasons
        };

        logger.debug(`[BotDetection] Detected cross-channel spam for ${message.author.id}: ${uniqueChannels.size} channels, ${tracked.length} messages, confidence: ${spamResult.confidence}%`);
        return spamResult;
    }

    if (isFirstMessage && confidence > 0) {
        return {
            isSpam: false,
            confidence: Math.min(confidence, 100),
            reasons,
            firstMessageSuspicious: true
        };
    }

    return { isSpam: false, confidence: 0, reasons: [] };
}
//
async function checkActiveUserBypass(serverID, userID) {
    const cacheKey = `${serverID}:${userID}`;
    const cached = activeUserCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < ACTIVE_CACHE_TTL)) {
        return cached.data;
    }

    try {
        const status = await ActiveUserStatus.findOne({ serverID, userID }).lean();

        if (!status) {
            const result = { bypass: false, reason: 'no_active_status' };
            activeUserCache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        }

        const timeSinceLastMessage = Date.now() - new Date(status.lastMessageAt).getTime();

        if (timeSinceLastMessage > TWO_WEEKS_MS) {
            const result = {
                bypass: false,
                reason: 'inactive_2w',
                needsReset: true,
                initialConfidence: status.initialConfidence
            };
            activeUserCache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        }

        const result = {
            bypass: true,
            reason: 'active_user',
            initialConfidence: status.initialConfidence,
            lastMessageAt: status.lastMessageAt
        };
        activeUserCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    } catch (error) {
        logger.error(`[BotDetection] Error checking active user bypass:`, error);
        return { bypass: false, reason: 'error' };
    }
}

async function markUserAsActive(serverID, userID, initialConfidence) {
    if (initialConfidence > ACTIVE_CONFIDENCE_THRESHOLD) return null;

    try {
        const result = await ActiveUserStatus.findOneAndUpdate(
            { serverID, userID },
            {
                $set: {
                    initialConfidence,
                    lastMessageAt: new Date(),
                    firstMessageReset: false
                },
                $setOnInsert: {
                    clearedAt: new Date()
                }
            },
            { upsert: true, new: true }
        );

        const cacheKey = `${serverID}:${userID}`;
        activeUserCache.set(cacheKey, {
            data: {
                bypass: true,
                reason: 'active_user',
                initialConfidence,
                lastMessageAt: result.lastMessageAt
            },
            timestamp: Date.now()
        });

        logger.debug(`[BotDetection] Marked user ${userID} as active in ${serverID} (confidence: ${initialConfidence}%)`);
        return result;
    } catch (error) {
        logger.error(`[BotDetection] Error marking user as active:`, error);
        return null;
    }
}

async function touchActiveUserMessage(serverID, userID) {
    const throttleKey = `${serverID}:${userID}`;
    const lastUpdate = lastMessageUpdateTracker.get(throttleKey);

    if (lastUpdate && (Date.now() - lastUpdate < MESSAGE_UPDATE_THROTTLE)) {
        return;
    }

    lastMessageUpdateTracker.set(throttleKey, Date.now());

    try {
        await ActiveUserStatus.findOneAndUpdate(
            { serverID, userID },
            { $set: { lastMessageAt: new Date() } }
        );

        const cacheKey = `${serverID}:${userID}`;
        const cached = activeUserCache.get(cacheKey);
        if (cached?.data) {
            cached.data.lastMessageAt = new Date();
            cached.timestamp = Date.now();
        }
    } catch (error) {
        logger.error(`[BotDetection] Error touching active user message:`, error);
    }
}

async function resetInactiveUser(serverID, userID) {
    try {
        await ActiveUserStatus.findOneAndUpdate(
            { serverID, userID },
            { $set: { firstMessageReset: true } }
        );

        const cacheKey = `${serverID}:${userID}`;
        activeUserCache.delete(cacheKey);
        firstMessageTracker.delete(cacheKey);

        logger.debug(`[BotDetection] Reset inactive user ${userID} in ${serverID} for first-message re-evaluation`);
    } catch (error) {
        logger.error(`[BotDetection] Error resetting inactive user:`, error);
    }
}
//
module.exports = {
    getSettings,
    saveSettings,
    calculateConfidence,
    addGlobalInfractionFactor,
    getActionFromConfidence,
    checkAltEvasion,
    isQualifiedServer,
    trackGlobalInfraction,
    createTracking,
    updateTracking,
    analyzeMessageBehavior,
    markAnalyzed,
    getRiskLevel,
    addRecentBan,
    extractLinks,
    isLinkTrusted,
    isSuspiciousLink,
    analyzeFirstMessage,
    checkCrossChannelLinkSpam,
    checkActiveUserBypass,
    markUserAsActive,
    touchActiveUserMessage,
    resetInactiveUser
};


// contributors: @relentiousdragon