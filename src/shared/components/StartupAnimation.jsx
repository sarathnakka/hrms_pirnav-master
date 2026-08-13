import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';

import { useAuth } from '../../features/auth/AuthContext';

const STARTUP_VIDEO = require('../../../assets/Pirnav_logo_Animation.mp4');
const STARTUP_FAILSAFE_MS = 6500;
const FADE_OUT_MS = 250;

function StartupAnimation({ authReady, onFinish }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const hasStartedRef = useRef(false);
  const hasVideoFinishedRef = useRef(false);
  const hasFinishedRef = useRef(false);
  const mountedRef = useRef(true);
  const [videoFinished, setVideoFinished] = useState(false);
  const [isFading, setIsFading] = useState(false);

  const player = useVideoPlayer(STARTUP_VIDEO, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = true;
    videoPlayer.allowsExternalPlayback = false;
    videoPlayer.staysActiveInBackground = false;
    videoPlayer.showNowPlayingNotification = false;
  });

  const markVideoFinished = useCallback(() => {
    if (hasVideoFinishedRef.current) {
      return;
    }

    hasVideoFinishedRef.current = true;

    if (mountedRef.current) {
      setVideoFinished(true);
    }
  }, []);

  const startPlaybackIfReady = useCallback((status) => {
    if (status === 'error') {
      markVideoFinished();
      return;
    }

    if (status !== 'readyToPlay' || hasStartedRef.current || hasVideoFinishedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    try {
      player.currentTime = 0;
      player.play();
    } catch {
      markVideoFinished();
    }
  }, [markVideoFinished, player]);

  useEventListener(player, 'playToEnd', markVideoFinished);

  useEventListener(player, 'statusChange', ({ status }) => {
    startPlaybackIfReady(status);
  });

  useEffect(() => {
    startPlaybackIfReady(player.status);
  }, [player.status, startPlaybackIfReady]);

  useEffect(() => {
    const timer = setTimeout(markVideoFinished, STARTUP_FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, [markVideoFinished]);

  useEffect(() => () => {
    mountedRef.current = false;
    opacity.stopAnimation();
  }, [opacity]);

  useEffect(() => {
    if (!authReady || !videoFinished || isFading || hasFinishedRef.current) {
      return;
    }

    setIsFading(true);

    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(() => {
      if (hasFinishedRef.current) {
        return;
      }

      hasFinishedRef.current = true;
      onFinish?.();
    });
  }, [authReady, isFading, onFinish, opacity, videoFinished]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <StatusBar hidden />
      <View style={styles.videoStage}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls={false}
          contentFit="contain"
          fullscreenOptions={{
            enable: false,
          }}
          allowsPictureInPicture={false}
          startsPictureInPictureAutomatically={false}
        />
      </View>
    </Animated.View>
  );
}

export function StartupGate({ children }) {
  const { isInitializing } = useAuth();
  const [startupFinished, setStartupFinished] = useState(false);

  const handleStartupFinished = useCallback(() => {
    setStartupFinished(true);
  }, []);

  if (!startupFinished) {
    return (
      <StartupAnimation
        authReady={!isInitializing}
        onFinish={handleStartupFinished}
      />
    );
  }

  return children;
}

export default StartupAnimation;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  videoStage: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
