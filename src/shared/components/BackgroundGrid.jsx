import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../../theme';

export default function BackgroundGrid() {
  return (
    <View style={styles.gridOverlay}>
      <View style={styles.gridLineHorizontal1} />
      <View style={styles.gridLineHorizontal2} />
      <View style={styles.gridLineHorizontal3} />
      <View style={styles.gridLineVertical1} />
      <View style={styles.gridLineVertical2} />
      <View style={styles.gridLineVertical3} />
    </View>
  );
}

const styles = StyleSheet.create({
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.12,
    pointerEvents: 'none',
  },
  gridLineHorizontal1: {
    position: 'absolute',
    top: '15%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.primary,
  },
  gridLineHorizontal2: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.primary,
  },
  gridLineHorizontal3: {
    position: 'absolute',
    top: '75%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.primary,
  },
  gridLineVertical1: {
    position: 'absolute',
    left: '25%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.primary,
  },
  gridLineVertical2: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.primary,
  },
  gridLineVertical3: {
    position: 'absolute',
    left: '75%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.primary,
  },
});

