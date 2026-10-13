import React, { useState } from 'react';
import { Alert } from 'react-native';
import ActionSheet, { SheetAction } from '../components/ActionSheet';
import ReportSheet from '../components/ReportSheet';
import { blockUser, reportUser, unblockUser } from '../services/users';

type Options = {
  userId: number;
  name: string;
  blocked: boolean;
  conversationId?: number | null;
  onBlockedChange: (blocked: boolean) => void;
  extraActions?: SheetAction[]; // jaise "View profile"
};

/** Chat aur Profile dono ka ⋯ menu: Report + Block/Unblock (confirm ke saath) */
export function useSafetyMenu({ userId, name, blocked, conversationId, onBlockedChange, extraActions = [] }: Options) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const doBlock = () =>
    Alert.alert(`Block ${name}?`, `${name} won't be able to message you or see your profile. They won't be notified.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(userId);
            onBlockedChange(true);
          } catch (e) {
            Alert.alert('Could not block', (e as Error).message);
          }
        },
      },
    ]);

  const doUnblock = async () => {
    try {
      await unblockUser(userId);
      onBlockedChange(false);
    } catch (e) {
      Alert.alert('Could not unblock', (e as Error).message);
    }
  };

  const actions: SheetAction[] = [
    ...extraActions,
    { label: 'Report', icon: 'shield', onPress: () => setReportOpen(true), danger: true },
    blocked
      ? { label: `Unblock ${name}`, icon: 'lock', onPress: doUnblock }
      : { label: `Block ${name}`, icon: 'lock', onPress: doBlock, danger: true },
  ];

  const sheets = (
    <>
      <ActionSheet visible={menuOpen} title={name} actions={actions} onClose={() => setMenuOpen(false)} />
      <ReportSheet
        visible={reportOpen}
        name={name}
        onClose={() => setReportOpen(false)}
        onSubmit={async ({ reason, details, block }) => {
          const res = await reportUser(userId, { reason, details: details || undefined, conversationId: conversationId ?? undefined, block: block && !blocked });
          setReportOpen(false);
          if (res.blocked) onBlockedChange(true);
          Alert.alert('Thanks for reporting', 'Our team will review this. You help keep Meto safe 💖');
        }}
      />
    </>
  );

  return { openMenu: () => setMenuOpen(true), unblock: doUnblock, sheets };
}
