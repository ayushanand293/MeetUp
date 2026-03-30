import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import client from '../api/client';
import { useTheme, Spacing, Radius, Font } from '../theme';

const MOCK_HISTORY = [
    {
        session_id: 'mock-session-1',
        co_participant_id: 'mock-user-sarah',
        co_participant_name: 'Sarah',
        co_participant_email: 'sarah@test.com',
        ended_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
        session_id: 'mock-session-2',
        co_participant_id: 'mock-user-marcus',
        co_participant_name: 'Marcus',
        co_participant_email: 'marcus@test.com',
        ended_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    },
    {
        session_id: 'mock-session-3',
        co_participant_id: 'mock-user-jordan',
        co_participant_name: 'Jordan',
        co_participant_email: 'jordan@test.com',
        ended_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
];

const formatTimeAgo = (endedAt) => {
    if (!endedAt) return 'Recently';
    const date = new Date(endedAt);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}`;
};

const QuickFriendsScreen = ({ navigation }) => {
    const { colors } = useTheme();
    const [history, setHistory] = useState([]);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await client.get('/sessions/history');
                const historyItems = res.data?.history || [];
                setHistory(historyItems.length ? historyItems : MOCK_HISTORY);
            } catch (_) {
                setHistory(MOCK_HISTORY);
            }
        };
        fetchHistory();
    }, []);

    const quickFriends = useMemo(() => {
        const grouped = new Map();

        history.forEach((item) => {
            const key = item.co_participant_id || item.co_participant_name;
            if (!key) return;

            const endedAtMs = item.ended_at ? new Date(item.ended_at).getTime() : 0;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    ...item,
                    meetup_count: 1,
                    last_met_ms: endedAtMs,
                });
                return;
            }

            const current = grouped.get(key);
            const nextCount = current.meetup_count + 1;
            const shouldReplaceBase = endedAtMs > current.last_met_ms;
            grouped.set(key, {
                ...(shouldReplaceBase ? item : current),
                meetup_count: nextCount,
                last_met_ms: Math.max(current.last_met_ms, endedAtMs),
            });
        });

        return Array.from(grouped.values())
            .map((friend) => {
                const ageHours = Math.max(0, (Date.now() - friend.last_met_ms) / 3600000);
                const recencyScore = 1 / (1 + ageHours);
                const frequencyScore = Math.min(friend.meetup_count / 5, 1);
                return {
                    ...friend,
                    score: recencyScore * 0.68 + frequencyScore * 0.32,
                };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 12);
    }, [history]);

    const handleMeetAgain = (friend) => {
        if (friend.co_participant_id && friend.co_participant_email) {
            navigation.navigate('Request', {
                friend: {
                    id: friend.co_participant_id,
                    display_name: friend.co_participant_name,
                    email: friend.co_participant_email,
                },
            });
            return;
        }
        navigation.navigate('FriendList');
    };

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md }}>
            <View style={{ marginBottom: Spacing.md }}>
                <Text style={[Font.label, { color: colors.textMuted, marginBottom: 6 }]}>RECONNECT</Text>
                <Text style={[Font.title, { color: colors.textPrimary }]}>Quick Friends</Text>
                <Text style={[Font.body, { color: colors.textSecondary, marginTop: 4 }]}>People you already met. Tap once to meet again.</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
                {quickFriends.map((friend) => (
                    <View
                        key={friend.co_participant_id || `${friend.co_participant_name}-${friend.session_id}`}
                        style={{
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: Radius.md,
                            padding: Spacing.md,
                            marginBottom: Spacing.sm,
                        }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{
                                width: 42,
                                height: 42,
                                borderRadius: 21,
                                backgroundColor: colors.surfaceElevated,
                                borderWidth: 1,
                                borderColor: colors.border,
                                justifyContent: 'center',
                                alignItems: 'center',
                                marginRight: Spacing.sm,
                            }}>
                                <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '800' }}>
                                    {(friend.co_participant_name || '?')[0].toUpperCase()}
                                </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[Font.subtitle, { color: colors.textPrimary, fontSize: 16 }]}>{friend.co_participant_name}</Text>
                                <Text style={[Font.caption, { color: colors.textMuted, marginTop: 2 }]}>Last met {formatTimeAgo(friend.ended_at)} • {friend.meetup_count || 1} meetups</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => handleMeetAgain(friend)}
                                style={{
                                    borderWidth: 1,
                                    borderColor: colors.textPrimary,
                                    backgroundColor: colors.textPrimary,
                                    borderRadius: Radius.pill,
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                }}>
                                <Text style={{ color: colors.bg, fontSize: 12, fontWeight: '800' }}>Meet Again</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
};

export default QuickFriendsScreen;
