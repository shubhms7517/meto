import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

// Koi screen crash ho to laal/safed screen ki jagah saaf message + "Try again"
type State = { failed: boolean };

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('screen crashed', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={st.root}>
        <Text style={st.icon}>😕</Text>
        <Text style={st.title}>Something went wrong</Text>
        <Text style={st.text}>Please try again. If it keeps happening, restart the app.</Text>
        <Pressable onPress={() => this.setState({ failed: false })} style={st.btn}>
          <Text style={st.btnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const st = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: colors.bg },
  icon: { fontSize: 44 },
  title: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 12 },
  text: { color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  btn: { marginTop: 20, paddingHorizontal: 26, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.rose1 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
