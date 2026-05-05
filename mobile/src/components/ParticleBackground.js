import React, { useRef, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Animated, Dimensions, StyleSheet } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CONNECTION_DISTANCE = 110;
const SCATTER_RADIUS = 130;
const SCATTER_FORCE = 55;

/**
 * ParticleBackground
 *
 * Constellation-style network of dots connected by thin lines.
 * Exposes scatter(x,y) and release() so the parent screen can
 * forward touch events without blocking form interactions.
 */
const ParticleBackground = forwardRef(({
  count = 35,
  dotColor = 'rgba(177,18,27,0.45)',
  dotColorAlt = 'rgba(130,130,130,0.35)',
  lineColor = 'rgba(177,18,27,0.08)',
}, ref) => {
  const nodes = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const x = Math.random() * SCREEN_W;
      const y = Math.random() * SCREEN_H;
      const size = 2.5 + Math.random() * 3.5;
      const isRed = Math.random() < 0.4;
      const driftSpeed = 3000 + Math.random() * 4000;
      const driftAmplitude = 4 + Math.random() * 10;
      return {
        id: i,
        x,
        y,
        size,
        color: isRed ? dotColor : dotColorAlt,
        opacity: 0.5 + Math.random() * 0.4,
        driftSpeed,
        driftAmplitude,
      };
    });
  }, [count, dotColor, dotColorAlt]);

  /* ── connecting lines ── */
  const lines = useMemo(() => {
    const result = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECTION_DISTANCE) {
          const strength = 1 - dist / CONNECTION_DISTANCE;
          result.push({
            x1: nodes[i].x, y1: nodes[i].y,
            x2: nodes[j].x, y2: nodes[j].y,
            opacity: strength * 0.5,
          });
        }
      }
    }
    return result;
  }, [nodes]);

  /* ── scatter refs for each node ── */
  const scatterRefsRef = useRef(null);
  if (!scatterRefsRef.current) {
    scatterRefsRef.current = nodes.map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
    }));
  }
  const scatterRefs = scatterRefsRef.current;
  const releaseTimerRef = useRef(null);

  /* ── expose scatter/release to parent ── */
  useImperativeHandle(ref, () => ({
    scatter(touchX, touchY) {
      if (releaseTimerRef.current) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
      nodes.forEach((node, idx) => {
        const dx = node.x - touchX;
        const dy = node.y - touchY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < SCATTER_RADIUS && dist > 0) {
          const angle = Math.atan2(dy, dx);
          const force = (1 - dist / SCATTER_RADIUS) * SCATTER_FORCE;
          Animated.parallel([
            Animated.timing(scatterRefs[idx].x, {
              toValue: Math.cos(angle) * force,
              duration: 100,
              useNativeDriver: true,
            }),
            Animated.timing(scatterRefs[idx].y, {
              toValue: Math.sin(angle) * force,
              duration: 100,
              useNativeDriver: true,
            }),
          ]).start();
        }
      });
    },
    release() {
      releaseTimerRef.current = setTimeout(() => {
        scatterRefs.forEach((s) => {
          Animated.parallel([
            Animated.spring(s.x, { toValue: 0, tension: 40, friction: 6, useNativeDriver: true }),
            Animated.spring(s.y, { toValue: 0, tension: 40, friction: 6, useNativeDriver: true }),
          ]).start();
        });
      }, 120);
    },
  }), [nodes, scatterRefs]);

  /* ── fade in ── */
  const fadeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 800,
      delay: 200,
      useNativeDriver: true,
    }).start();
  }, [fadeIn]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeIn }]} pointerEvents="none">
      {/* SVG lines + static dots */}
      <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
        {lines.map((line, i) => (
          <Line
            key={`l-${i}`}
            x1={line.x1} y1={line.y1}
            x2={line.x2} y2={line.y2}
            stroke={lineColor}
            strokeWidth={1}
            opacity={line.opacity}
          />
        ))}
        {nodes.map((node) => (
          <Circle
            key={`c-${node.id}`}
            cx={node.x} cy={node.y}
            r={node.size / 2}
            fill={node.color}
            opacity={node.opacity * 0.4}
          />
        ))}
      </Svg>

      {/* Animated floating dots */}
      {nodes.map((node, idx) => (
        <FloatingDot key={`f-${node.id}`} node={node} scatter={scatterRefs[idx]} />
      ))}
    </Animated.View>
  );
});

/** Floating dot with drift + scatter support */
const FloatingDot = React.memo(({ node, scatter }) => {
  const driftX = useRef(new Animated.Value(0)).current;
  const driftY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      tension: 50,
      friction: 8,
      delay: node.id * 20,
      useNativeDriver: true,
    }).start();

    const xLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(driftX, {
          toValue: node.driftAmplitude,
          duration: node.driftSpeed,
          useNativeDriver: true,
        }),
        Animated.timing(driftX, {
          toValue: -node.driftAmplitude * 0.5,
          duration: node.driftSpeed * 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(driftX, {
          toValue: 0,
          duration: node.driftSpeed * 0.5,
          useNativeDriver: true,
        }),
      ]),
    );

    const yLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(driftY, {
          toValue: -node.driftAmplitude * 0.6,
          duration: node.driftSpeed * 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(driftY, {
          toValue: node.driftAmplitude * 0.4,
          duration: node.driftSpeed * 0.7,
          useNativeDriver: true,
        }),
        Animated.timing(driftY, {
          toValue: 0,
          duration: node.driftSpeed * 0.6,
          useNativeDriver: true,
        }),
      ]),
    );

    xLoop.start();
    yLoop.start();
    return () => { xLoop.stop(); yLoop.stop(); };
  }, [driftX, driftY, scale, node]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: node.x - node.size / 2,
        top: node.y - node.size / 2,
        width: node.size,
        height: node.size,
        borderRadius: node.size / 2,
        backgroundColor: node.color,
        opacity: node.opacity,
        transform: [
          { translateX: Animated.add(driftX, scatter.x) },
          { translateY: Animated.add(driftY, scatter.y) },
          { scale },
        ],
      }}
    />
  );
});

export default ParticleBackground;
