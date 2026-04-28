@import "tailwindcss";

:root {
  --bg: #040404;
  --bg-2: #0a0704;
  --text: #fff7e7;
  --muted: rgba(255, 246, 226, 0.72);

  --gold-1: #fff6ca;
  --gold-2: #ffd66d;
  --gold-3: #f4b93a;
  --gold-4: #9d5d12;
  --gold-5: #6d3908;

  --panel: rgba(10, 8, 5, 0.84);
  --panel-2: rgba(12, 9, 6, 0.92);
  --border: rgba(255, 219, 127, 0.22);
}

* {
  box-sizing: border-box;
}

html {
  background: var(--bg);
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 50% -10%, rgba(255, 212, 98, 0.18), transparent 34%),
    radial-gradient(circle at 85% 10%, rgba(255, 176, 41, 0.1), transparent 22%),
    radial-gradient(circle at 15% 20%, rgba(255, 194, 70, 0.09), transparent 24%),
    linear-gradient(180deg, #130b03 0%, #060605 45%, #020202 100%);
  color: var(--text);
  font-family: Arial, Helvetica, sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input {
  font-family: inherit;
}

::selection {
  background: rgba(255, 208, 86, 0.32);
  color: white;
}

.site-shell {
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
}

.site-shell::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.16;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18) 0 1px, transparent 1px),
    radial-gradient(circle at 70% 35%, rgba(255,231,170,0.14) 0 1px, transparent 1px),
    radial-gradient(circle at 35% 75%, rgba(255,255,255,0.08) 0 1px, transparent 1px);
  background-size: 50px 50px, 88px 88px, 120px 120px;
}

.page-glow {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.page-glow::before {
  content: "";
  position: absolute;
  left: 50%;
  top: -180px;
  width: 1200px;
  height: 560px;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(255, 214, 98, 0.24), transparent 62%);
  filter: blur(42px);
}

.browser-frame {
  position: relative;
  z-index: 2;
  width: min(100% - 36px, 1680px);
  margin: 18px auto 0;
  overflow: hidden;
  border-radius: 28px;
  border: 1px solid rgba(255, 231, 165, 0.1);
  background: rgba(8, 8, 8, 0.72);
  box-shadow:
    0 32px 100px rgba(0, 0, 0, 0.58),
    0 0 0 1px rgba(255, 208, 88, 0.04),
    0 0 110px rgba(255, 186, 49, 0.08);
}

.browser-topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 54px;
  padding: 0 18px;
  background: linear-gradient(180deg, rgba(49,49,49,0.98), rgba(24,24,24,0.98));
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.browser-dots {
  display: flex;
  gap: 8px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
}

.dot-red {
  background: #ff5f57;
}

.dot-yellow {
  background: #ffbd2e;
}

.dot-green {
  background: #28c840;
}

.browser-nav-arrows {
  display: flex;
  gap: 14px;
  color: rgba(255,255,255,0.4);
  font-size: 22px;
  line-height: 1;
}

.browser-address {
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(760px, 100%);
  height: 34px;
  margin: 0 auto;
  padding: 0 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.32);
  color: rgba(255,255,255,0.72);
  font-size: 14px;
  font-weight: 700;
}

.browser-close {
  color: rgba(255,255,255,0.45);
  font-size: 22px;
  line-height: 1;
}

.hero-surface {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 68% 12%, rgba(255, 216, 110, 0.28), transparent 22%),
    radial-gradient(circle at 55% 34%, rgba(255, 179, 51, 0.12), transparent 24%),
    radial-gradient(circle at 16% 18%, rgba(255, 215, 111, 0.1), transparent 20%),
    linear-gradient(180deg, #120c04 0%, #070604 50%, #030303 100%);
}

.hero-surface::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(255, 210, 89, 0.03) 0 1px, transparent 1px),
    linear-gradient(180deg, rgba(255, 210, 89, 0.025) 0 1px, transparent 1px);
  background-size: 70px 70px;
  mask-image: linear-gradient(180deg, black, transparent 78%);
}

.hero-surface::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -30px;
  height: 360px;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 4% 70%, rgba(255, 226, 161, 0.15), transparent 32%),
    radial-gradient(ellipse at 35% 86%, rgba(255, 226, 161, 0.12), transparent 28%),
    radial-gradient(ellipse at 69% 80%, rgba(255, 226, 161, 0.13), transparent 29%),
    radial-gradient(ellipse at 96% 72%, rgba(255, 226, 161, 0.15), transparent 32%);
}

.page-container {
  position: relative;
  z-index: 2;
  width: min(100%, 1540px);
  margin: 0 auto;
  padding-left: 32px;
  padding-right: 32px;
}

.header-row {
  height: 104px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-mark {
  position: relative;
  width: 62px;
  height: 62px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  color: var(--gold-2);
  border: 1px solid rgba(255, 224, 141, 0.36);
  background:
    linear-gradient(180deg, rgba(255,236,172,0.1), rgba(255,182,48,0.04)),
    rgba(0,0,0,0.44);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.14),
    0 0 32px rgba(255, 203, 76, 0.14);
}

.brand-title {
  font-size: 34px;
  line-height: 0.92;
  font-weight: 950;
  letter-spacing: -0.07em;
  color: #ffdb7b;
  text-shadow:
    0 1px 0 #fff1bc,
    0 2px 0 #bb7a17,
    0 4px 0 #6b3a07,
    0 10px 28px rgba(255, 196, 62, 0.26);
}

.brand-subtitle {
  margin-top: 5px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: rgba(255, 216, 117, 0.78);
}

.main-nav {
  display: flex;
  align-items: center;
  gap: 38px;
  color: rgba(255, 240, 204, 0.82);
  font-size: 14px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.main-nav a {
  transition: 0.18s ease;
}

.main-nav a:hover {
  color: var(--gold-2);
}

.gold-button,
.dark-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 54px;
  padding: 0 24px;
  border-radius: 18px;
  border: none;
  font-size: 14px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.045em;
  transition: 0.18s ease;
  white-space: nowrap;
  cursor: pointer;
}

.gold-button {
  color: #201103;
  background:
    linear-gradient(180deg, rgba(255,247,207,0.98), rgba(255,203,77,0.98) 42%, rgba(157,91,12,0.98));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.72),
    0 12px 30px rgba(255, 186, 50, 0.28),
    0 0 0 1px rgba(255, 231, 155, 0.38);
}

.gold-button:hover {
  transform: translateY(-2px);
  filter: brightness(1.05);
}

.gold-button.compact {
  min-height: 48px;
  padding: 0 20px;
}

.dark-button {
  color: #ffe8a7;
  background: linear-gradient(180deg, rgba(28,21,12,0.95), rgba(9,8,6,0.96));
  border: 1px solid rgba(255, 216, 122, 0.28);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 16px 34px rgba(0,0,0,0.28);
}

.dark-button:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 224, 145, 0.56);
}

.hero-grid {
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: 34px;
  align-items: center;
  min-height: 740px;
  padding-bottom: 34px;
}

.hero-chip,
.section-chip {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 218, 124, 0.23);
  background: rgba(0,0,0,0.28);
  color: #ffe8b0;
  font-size: 14px;
  font-weight: 900;
  box-shadow: 0 0 28px rgba(255, 203, 78, 0.08);
}

.section-chip {
  min-height: 38px;
  font-size: 13px;
}

.hero-title {
  margin: 18px 0 0;
  font-size: clamp(76px, 7.6vw, 132px);
  line-height: 0.84;
  font-weight: 950;
  letter-spacing: -0.095em;
  text-transform: uppercase;
  color: #ffdc7a;
  text-shadow:
    0 1px 0 #fff3bf,
    0 2px 0 #d0901f,
    0 5px 0 #774107,
    0 12px 28px rgba(255, 191, 57, 0.34),
    0 0 54px rgba(255, 216, 112, 0.2);
}

.hero-platforms {
  margin-top: 24px;
  color: white;
  font-size: clamp(24px, 2.45vw, 42px);
  line-height: 1;
  font-weight: 950;
}

.hero-description {
  margin-top: 24px;
  max-width: 680px;
  color: rgba(255,247,231,0.9);
  font-size: clamp(21px, 1.5vw, 30px);
  line-height: 1.28;
  font-weight: 900;
}

.hero-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 216, 122, 0.28);
  background:
    linear-gradient(135deg, rgba(255,224,140,0.08), rgba(255,186,57,0.02)),
    rgba(0,0,0,0.34);
  color: #fff1c7;
  font-size: 14px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 32px;
}

.hero-right {
  position: relative;
  min-height: 620px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-orbit {
  position: absolute;
  top: 28px;
  left: 50%;
  width: 360px;
  height: 82px;
  transform: translateX(-50%);
  border-radius: 999px;
  border: 2px solid rgba(255, 232, 155, 0.54);
  background: rgba(255, 224, 130, 0.05);
  box-shadow:
    0 0 36px rgba(255, 214, 97, 0.24),
    inset 0 0 22px rgba(255, 228, 157, 0.14);
}

.hero-orbit::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 14px;
  width: 360px;
  height: 220px;
  transform: translateX(-50%);
  background: radial-gradient(ellipse, rgba(255, 217, 107, 0.4), transparent 66%);
  filter: blur(34px);
}

.hero-cards {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: 16px;
  z-index: 2;
}

.hero-card-wrap {
  position: relative;
  border: none;
  background: transparent;
  padding-top: 118px;
  cursor: pointer;
  transform-style: preserve-3d;
}

.hero-card-wrap--left {
  transform: rotate(-6deg) translateY(24px);
}

.hero-card-wrap--center {
  transform: translateY(-4px);
}

.hero-card-wrap--right {
  transform: rotate(6deg) translateY(24px);
}

.hero-card-wings {
  position: absolute;
  left: 50%;
  top: 132px;
  width: 430px;
  height: 180px;
  transform: translateX(-50%);
  z-index: 1;
  pointer-events: none;
}

.hero-card-wings::before,
.hero-card-wings::after {
  content: "";
  position: absolute;
  top: 0;
  width: 182px;
  height: 140px;
  opacity: 0.76;
  filter: drop-shadow(0 0 20px rgba(255, 208, 93, 0.34));
  background:
    linear-gradient(110deg, transparent 0 10%, rgba(255,236,173,0.95) 10% 16%, transparent 16% 22%),
    linear-gradient(96deg, transparent 8%, rgba(211,144,39,0.72) 18%, transparent 22%),
    linear-gradient(76deg, transparent 18%, rgba(255,242,192,0.86) 28%, transparent 32%),
    linear-gradient(58deg, transparent 28%, rgba(233,171,66,0.72) 38%, transparent 44%),
    linear-gradient(44deg, transparent 38%, rgba(255,229,139,0.72) 48%, transparent 56%);
  border-radius: 80% 20% 80% 20%;
}

.hero-card-wings::before {
  left: 10px;
  transform: rotate(-8deg);
}

.hero-card-wings::after {
  right: 10px;
  transform: scaleX(-1) rotate(-8deg);
}

.hero-card {
  position: relative;
  z-index: 3;
  min-height: 360px;
  padding: 22px;
  overflow: hidden;
  border-radius: 36px;
  border: 1px solid rgba(255, 235, 174, 0.3);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.2),
    0 32px 70px rgba(0,0,0,0.42),
    0 0 56px rgba(255, 195, 74, 0.08);
  transition: 0.22s ease;
}

.hero-card::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 0%, rgba(255,255,255,0.36), transparent 32%),
    linear-gradient(180deg, rgba(255,255,255,0.14), transparent 34%);
  pointer-events: none;
}

.hero-card::after {
  content: "";
  position: absolute;
  left: -42%;
  top: -80%;
  width: 80%;
  height: 180%;
  transform: rotate(24deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
  animation: card-shine 5.6s infinite;
}

@keyframes card-shine {
  0% {
    left: -80%;
  }
  42% {
    left: 130%;
  }
  100% {
    left: 130%;
  }
}

.hero-card:hover {
  transform: translateY(-8px) scale(1.02);
}

.hero-card--instagram {
  background: linear-gradient(180deg, #ff6ed2 0%, #f54597 42%, #ff9444 100%);
}

.hero-card--tiktok {
  background:
    radial-gradient(circle at 18% 18%, rgba(37,244,255,0.24), transparent 28%),
    radial-gradient(circle at 78% 26%, rgba(255,56,129,0.24), transparent 26%),
    linear-gradient(180deg, #171a22 0%, #06070b 100%);
}

.hero-card--shorts {
  background: linear-gradient(180deg, #ff734f 0%, #e43222 42%, #99180c 100%);
}

.hero-card-float-badge {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(255,245,210,0.98), rgba(255,204,77,0.98) 42%, rgba(157,91,12,0.98));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.74),
    0 8px 18px rgba(0,0,0,0.25);
}

.hero-card-float-badge::before,
.hero-card-float-badge::after {
  content: "";
  position: absolute;
  background: #fff3c6;
}

.hero-card-float-badge::before {
  width: 12px;
  height: 2px;
  top: 13px;
  left: 8px;
}

.hero-card-float-badge::after {
  width: 2px;
  height: 12px;
  top: 8px;
  left: 13px;
}

.hero-card-float-badge--second {
  top: auto;
  right: auto;
  left: 18px;
  bottom: 116px;
}

.hero-card-icon-shell {
  position: relative;
  z-index: 2;
  width: 132px;
  height: 132px;
  margin: 18px auto 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 36px;
  border: 1px solid rgba(255,255,255,0.28);
  background: rgba(255,255,255,0.16);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.42),
    0 20px 46px rgba(0,0,0,0.32);
  backdrop-filter: blur(12px);
}

.hero-card-icon {
  width: 70px;
  height: 70px;
  color: white;
  filter: drop-shadow(0 12px 20px rgba(0,0,0,0.24));
}

.hero-card-title {
  position: relative;
  z-index: 2;
  text-align: center;
  color: white;
  font-size: 30px;
  line-height: 1;
  font-weight: 950;
  letter-spacing: -0.04em;
  text-shadow: 0 8px 18px rgba(0,0,0,0.26);
}

.hero-card-metric {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-top: 24px;
  padding: 16px;
  border-radius: 22px;
  border: 1px solid rgba(255, 232, 155, 0.32);
  background: rgba(0,0,0,0.38);
}

.hero-card-metric-value {
  color: #ffe28c;
  font-size: 30px;
  line-height: 1;
  font-weight: 950;
}

.hero-card-metric-label {
  margin-top: 6px;
  color: rgba(255,255,255,0.72);
  font-size: 13px;
  font-weight: 850;
}

.hero-card-chart {
  width: 38px;
  height: 38px;
  color: #ffe28c;
}

.hero-card-pedestal {
  position: relative;
  z-index: 2;
  width: 84%;
  height: 56px;
  margin: 0 auto;
  border-radius: 999px 999px 18px 18px;
  background:
    linear-gradient(180deg, rgba(255,247,205,0.96), rgba(255,204,77,0.98) 42%, rgba(131,72,9,0.98));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.7),
    0 24px 40px rgba(0,0,0,0.28),
    0 0 36px rgba(255, 192, 61, 0.18);
}

.lessons-section {
  position: relative;
  z-index: 3;
  margin-top: -8px;
  padding-bottom: 34px;
}

.tabs-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.tab {
  min-height: 88px;
  padding: 18px 20px;
  border-radius: 24px 24px 0 0;
  border: none;
  text-align: left;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.18),
    0 18px 44px rgba(0,0,0,0.26);
  transition: 0.2s ease;
}

.tab:not(.is-active) {
  opacity: 0.6;
  filter: saturate(0.78);
}

.tab:not(.is-active):hover {
  opacity: 1;
  transform: translateY(-3px);
}

.tab--instagram {
  background: linear-gradient(135deg, #ff5ecc, #ff8551);
}

.tab--tiktok {
  background:
    radial-gradient(circle at 18% 20%, rgba(37,244,255,0.24), transparent 30%),
    radial-gradient(circle at 86% 28%, rgba(255,56,129,0.22), transparent 30%),
    linear-gradient(135deg, #11141c, #050506);
}

.tab--shorts {
  background: linear-gradient(135deg, #e72e20, #ff7046);
}

.tab-inner {
  display: flex;
  align-items: center;
  gap: 14px;
}

.tab-icon-shell {
  width: 50px;
  height: 50px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background: rgba(255,255,255,0.14);
  border: 1px solid rgba(255,255,255,0.16);
}

.tab-icon {
  width: 24px;
  height: 24px;
  color: white;
}

.tab-title {
  color: white;
  font-size: 21px;
  font-weight: 950;
  letter-spacing: -0.03em;
}

.tab-subtitle {
  margin-top: 4px;
  color: rgba(255,255,255,0.76);
  font-size: 13px;
  font-weight: 800;
}

.lessons-grid {
  display: grid;
  grid-template-columns: 1.28fr 0.72fr;
  gap: 16px;
}

.lesson-panel {
  position: relative;
  overflow: hidden;
  border-radius: 0 30px 30px 30px;
  border: 1px solid var(--border);
  background:
    linear-gradient(135deg, rgba(255,224,140,0.07), rgba(255,186,57,0.02)),
    rgba(8, 7, 5, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 26px 74px rgba(0,0,0,0.4);
}

.lesson-panel-glow {
  position: absolute;
  right: -100px;
  top: -100px;
  width: 320px;
  height: 320px;
  border-radius: 999px;
  filter: blur(72px);
  opacity: 0.55;
}

.lesson-panel--instagram .lesson-panel-glow {
  background: rgba(255, 90, 196, 0.34);
}

.lesson-panel--tiktok .lesson-panel-glow {
  background: rgba(37, 244, 255, 0.24);
}

.lesson-panel--shorts .lesson-panel-glow {
  background: rgba(255, 78, 48, 0.28);
}

.lesson-panel-content {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr 390px;
  gap: 28px;
  align-items: center;
  padding: 34px;
}

.lesson-title {
  margin: 18px 0 0;
  max-width: 780px;
  color: white;
  font-size: clamp(38px, 4vw, 60px);
  line-height: 0.96;
  letter-spacing: -0.055em;
  font-weight: 950;
}

.lesson-description {
  margin: 18px 0 0;
  max-width: 760px;
  color: rgba(255,255,255,0.76);
  font-size: 18px;
  line-height: 1.56;
  font-weight: 650;
}

.lesson-bullets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 22px;
}

.lesson-bullet {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 58px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(0,0,0,0.24);
  color: rgba(255,255,255,0.92);
  font-size: 15px;
  line-height: 1.25;
  font-weight: 800;
}

.lesson-bullet-icon {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gold-2);
  color: #170c02;
}

.lesson-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 26px;
}

.lesson-preview-area {
  position: relative;
  min-height: 430px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lesson-phone {
  position: relative;
  width: 280px;
  min-height: 430px;
  padding: 15px;
  border-radius: 40px;
  border: 1px solid rgba(255,255,255,0.18);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.1), rgba(255,255,255,0.03)),
    rgba(0,0,0,0.58);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    0 26px 64px rgba(0,0,0,0.44);
  transform: rotate(7deg);
  overflow: hidden;
}

.lesson-phone::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 40px;
  pointer-events: none;
  background:
    radial-gradient(circle at 70% 10%, rgba(255,255,255,0.14), transparent 24%),
    linear-gradient(180deg, rgba(255,255,255,0.06), transparent 18%);
}

.lesson-phone--instagram {
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    0 26px 64px rgba(0,0,0,0.44),
    0 0 52px rgba(255, 90, 196, 0.14);
}

.lesson-phone--tiktok {
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    0 26px 64px rgba(0,0,0,0.44),
    0 0 52px rgba(37, 244, 255, 0.12);
}

.lesson-phone--shorts {
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    0 26px 64px rgba(0,0,0,0.44),
    0 0 52px rgba(255, 78, 48, 0.12);
}

.lesson-phone-top {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  color: white;
  font-size: 14px;
  font-weight: 900;
}

.lesson-phone-stat {
  position: relative;
  z-index: 2;
  margin-top: 18px;
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
}

.lesson-phone-stat-label {
  color: rgba(255,255,255,0.56);
  font-size: 13px;
  font-weight: 800;
}

.lesson-phone-stat-value {
  margin-top: 8px;
  color: #ffe28c;
  font-size: 42px;
  line-height: 1;
  font-weight: 950;
}

.lesson-phone-stat-sub {
  margin-top: 6px;
  color: rgba(255,255,255,0.72);
  font-size: 13px;
  font-weight: 800;
}

.lesson-phone-line {
  position: absolute;
  left: 36px;
  right: 36px;
  top: 57%;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, #ff6c52, #ffe08a);
  transform: rotate(-13deg);
  box-shadow: 0 0 20px rgba(255, 144, 64, 0.44);
  z-index: 2;
}

.lesson-phone-line::after {
  content: "";
  position: absolute;
  right: -3px;
  top: -7px;
  width: 16px;
  height: 16px;
  border-right: 3px solid #ffe08a;
  border-top: 3px solid #ffe08a;
  transform: rotate(45deg);
}

.lesson-phone-bars {
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: 28px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: end;
  gap: 9px;
  z-index: 2;
}

.lesson-phone-bar {
  border-radius: 12px 12px 0 0;
  background: linear-gradient(180deg, #ffe08a, #ff643a);
  box-shadow: 0 0 16px rgba(255, 173, 55, 0.24);
}

.promo-cards-column {
  display: grid;
  gap: 16px;
}

.promo-card {
  position: relative;
  overflow: hidden;
  min-height: 312px;
  padding: 26px;
  border-radius: 30px;
  border: 1px solid var(--border);
  background:
    linear-gradient(135deg, rgba(255,224,140,0.06), rgba(255,186,57,0.02)),
    rgba(8, 7, 5, 0.88);
  text-align: left;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.07),
    0 24px 64px rgba(0,0,0,0.34);
  transition: 0.2s ease;
}

.promo-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 224, 145, 0.38);
}

.promo-card-glow {
  position: absolute;
  right: -90px;
  top: -90px;
  width: 220px;
  height: 220px;
  border-radius: 999px;
  filter: blur(56px);
  opacity: 0.55;
}

.promo-card--instagram .promo-card-glow {
  background: rgba(255, 90, 196, 0.26);
}

.promo-card--tiktok .promo-card-glow {
  background: rgba(37, 244, 255, 0.22);
}

.promo-card--shorts .promo-card-glow {
  background: rgba(255, 78, 48, 0.22);
}

.promo-card-title {
  position: relative;
  z-index: 2;
  color: white;
  font-size: 30px;
  line-height: 1;
  font-weight: 950;
  letter-spacing: -0.04em;
}

.promo-card-text {
  position: relative;
  z-index: 2;
  margin-top: 12px;
  color: rgba(255,255,255,0.72);
  font-size: 16px;
  line-height: 1.48;
  font-weight: 650;
}

.mini-visual {
  position: relative;
  z-index: 2;
  margin-top: 20px;
  height: 168px;
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.08);
}

.mini-visual--instagram {
  background:
    radial-gradient(circle at 70% 26%, rgba(255,90,196,0.28), transparent 24%),
    radial-gradient(circle at 28% 82%, rgba(255,182,73,0.18), transparent 24%),
    linear-gradient(180deg, #331118, #160805);
}

.mini-visual--tiktok {
  background:
    radial-gradient(circle at 72% 28%, rgba(37,244,255,0.34), transparent 22%),
    radial-gradient(circle at 22% 78%, rgba(255,56,129,0.24), transparent 25%),
    linear-gradient(180deg, #10141a, #06070a);
}

.mini-visual--shorts {
  background:
    radial-gradient(circle at 72% 26%, rgba(255,89,63,0.34), transparent 24%),
    radial-gradient(circle at 28% 82%, rgba(255,198,70,0.18), transparent 25%),
    linear-gradient(180deg, #2a0d08, #100504);
}

.mini-visual-icon-shell {
  position: absolute;
  right: 20px;
  bottom: 16px;
  width: 88px;
  height: 122px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.1);
  box-shadow: 0 18px 36px rgba(0,0,0,0.28);
}

.mini-visual-icon {
  width: 42px;
  height: 42px;
  color: white;
}

.mini-visual-bars {
  position: absolute;
  left: 18px;
  right: 118px;
  bottom: 18px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 7px;
  align-items: end;
}

.mini-visual-bar {
  border-radius: 9px 9px 0 0;
  background: linear-gradient(180deg, #ffbd4d, #ff4530);
}

.promo-card--tiktok .mini-visual-bar {
  background: linear-gradient(180deg, #21f4ff, #ff4b8d);
}

.mini-visual-trend {
  position: absolute;
  left: 18px;
  top: 18px;
  width: 38px;
  height: 38px;
  color: rgba(255,255,255,0.7);
}

.content-section {
  position: relative;
  z-index: 2;
  padding-top: 34px;
}

.content-section--last {
  padding-bottom: 34px;
}

.content-panel {
  padding: 34px;
  border-radius: 32px;
  border: 1px solid var(--border);
  background:
    linear-gradient(135deg, rgba(255,224,140,0.06), rgba(255,186,57,0.02)),
    rgba(8, 7, 5, 0.84);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.07),
    0 24px 70px rgba(0,0,0,0.3);
}

.section-title {
  margin: 18px 0 0;
  color: white;
  font-size: clamp(40px, 4vw, 62px);
  line-height: 0.95;
  letter-spacing: -0.06em;
  font-weight: 950;
  text-transform: uppercase;
}

.section-description {
  margin: 16px 0 0;
  max-width: 900px;
  color: rgba(255,255,255,0.72);
  font-size: 18px;
  line-height: 1.56;
  font-weight: 650;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 28px;
}

.info-card {
  padding: 26px;
  border-radius: 28px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(0,0,0,0.24);
}

.info-card-num {
  color: rgba(255, 221, 132, 0.17);
  font-size: 58px;
  line-height: 1;
  font-weight: 950;
}

.info-card-title {
  margin-top: 12px;
  color: white;
  font-size: 24px;
  line-height: 1.08;
  font-weight: 950;
  letter-spacing: -0.04em;
}

.info-card-text {
  margin-top: 12px;
  color: rgba(255,255,255,0.7);
  font-size: 16px;
  line-height: 1.55;
  font-weight: 650;
}

.package-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 28px;
}

.package-card {
  position: relative;
  overflow: hidden;
  min-height: 240px;
  padding: 28px;
  border-radius: 30px;
  border: 1px solid var(--border);
  background:
    linear-gradient(135deg, rgba(255,224,140,0.08), rgba(255,186,57,0.02)),
    rgba(0,0,0,0.24);
}

.package-card--hot {
  border-color: rgba(255, 222, 142, 0.42);
  background:
    radial-gradient(circle at 80% 0%, rgba(255,211,93,0.22), transparent 34%),
    linear-gradient(135deg, rgba(255,224,140,0.14), rgba(255,186,57,0.04)),
    rgba(0,0,0,0.24);
  box-shadow: 0 0 56px rgba(255, 195, 64, 0.12);
}

.package-hot {
  position: absolute;
  top: 18px;
  right: 18px;
  min-height: 32px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--gold-2);
  color: #1a0d02;
  font-size: 12px;
  font-weight: 950;
  text-transform: uppercase;
}

.package-title {
  color: white;
  font-size: 30px;
  line-height: 1;
  font-weight: 950;
  letter-spacing: -0.05em;
}

.package-price {
  margin-top: 10px;
  color: #ffe08a;
  font-size: 42px;
  line-height: 1;
  font-weight: 950;
}

.package-old-price {
  margin-top: 6px;
  color: rgba(255,255,255,0.42);
  font-size: 15px;
  font-weight: 800;
  text-decoration: line-through;
}

.package-description {
  margin-top: 18px;
  color: rgba(255,255,255,0.7);
  font-size: 16px;
  line-height: 1.48;
  font-weight: 650;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat-card {
  padding: 22px;
  border-radius: 26px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(0,0,0,0.24);
}

.stat-value {
  color: #ffe08a;
  font-size: 34px;
  line-height: 1;
  font-weight: 950;
}

.stat-label {
  margin-top: 10px;
  color: rgba(255,255,255,0.68);
  font-size: 13px;
  line-height: 1.35;
  font-weight: 850;
  text-transform: uppercase;
}

.footer {
  position: relative;
  z-index: 2;
  padding: 30px 20px 40px;
  text-align: center;
  color: rgba(255,255,255,0.42);
  font-size: 14px;
  font-weight: 850;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0,0,0,0.78);
  backdrop-filter: blur(14px);
}

.modal-card {
  position: relative;
  width: min(100%, 560px);
  overflow: hidden;
  padding: 28px;
  border-radius: 32px;
  border: 1px solid rgba(255, 222, 142, 0.24);
  background:
    radial-gradient(circle at 100% 0%, rgba(255,203,72,0.16), transparent 32%),
    linear-gradient(135deg, rgba(255,224,140,0.1), rgba(255,186,57,0.03)),
    rgba(8, 7, 5, 0.94);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 30px 96px rgba(0,0,0,0.52);
}

.modal-close-button {
  position: absolute;
  right: 18px;
  top: 18px;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(0,0,0,0.36);
  color: rgba(255,255,255,0.72);
  cursor: pointer;
}

.modal-icon-shell {
  width: 68px;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.1);
}

.modal-icon {
  width: 34px;
  height: 34px;
  color: white;
}

.modal-title {
  margin: 18px 0 0;
  padding-right: 42px;
  color: white;
  font-size: clamp(36px, 5vw, 56px);
  line-height: 0.94;
  letter-spacing: -0.06em;
  font-weight: 950;
}

.modal-text {
  margin: 14px 0 0;
  color: rgba(255,255,255,0.72);
  font-size: 17px;
  line-height: 1.55;
  font-weight: 650;
}

.modal-price-box {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-top: 20px;
  padding: 18px;
  border-radius: 24px;
  border: 1px solid rgba(255, 222, 142, 0.18);
  background: rgba(0,0,0,0.3);
}

.modal-price-label {
  color: rgba(255,255,255,0.5);
  font-size: 13px;
  font-weight: 900;
  text-transform: uppercase;
}

.modal-price-value {
  margin-top: 6px;
  color: #ffe08a;
  font-size: 46px;
  line-height: 1;
  font-weight: 950;
}

.modal-old-price {
  color: rgba(255,255,255,0.44);
  font-size: 14px;
  font-weight: 800;
  text-align: right;
}

.modal-old-price span {
  text-decoration: line-through;
}

.modal-input-label {
  display: block;
  margin-top: 18px;
  margin-bottom: 8px;
  color: #ffe7a4;
  font-size: 13px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.modal-input-wrap {
  position: relative;
}

.modal-input-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  width: 20px;
  height: 20px;
  color: var(--gold-2);
  transform: translateY(-50%);
  pointer-events: none;
}

.modal-input {
  width: 100%;
  height: 58px;
  padding: 0 16px 0 50px;
  border-radius: 18px;
  border: 1px solid rgba(255, 222, 142, 0.24);
  outline: none;
  background: rgba(0,0,0,0.44);
  color: white;
  font-size: 16px;
  font-weight: 800;
}

.modal-input::placeholder {
  color: rgba(255,255,255,0.28);
}

.modal-input:focus {
  border-color: rgba(255, 226, 150, 0.68);
}

.modal-error {
  margin-top: 14px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(255, 90, 90, 0.26);
  background: rgba(255, 67, 67, 0.1);
  color: #ffcaca;
  font-size: 14px;
  font-weight: 800;
}

.modal-submit {
  width: 100%;
  margin-top: 18px;
}

@media (max-width: 1240px) {
  .main-nav {
    display: none;
  }

  .hero-grid {
    grid-template-columns: 1fr;
    min-height: auto;
    padding-top: 22px;
  }

  .hero-right {
    min-height: auto;
    padding-top: 24px;
    padding-bottom: 14px;
  }

  .hero-card-wrap--left,
  .hero-card-wrap--center,
  .hero-card-wrap--right {
    transform: none;
  }

  .hero-card-wrap {
    padding-top: 64px;
  }

  .hero-card-wings {
    display: none;
  }

  .lessons-grid {
    grid-template-columns: 1fr;
  }

  .lesson-panel-content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 920px) {
  .browser-frame {
    width: 100%;
    margin: 0;
    border-radius: 0;
    border-left: 0;
    border-right: 0;
  }

  .browser-topbar {
    display: none;
  }

  .page-container {
    padding-left: 18px;
    padding-right: 18px;
  }

  .header-row {
    height: auto;
    padding: 18px 0;
    gap: 14px;
  }

  .brand-mark {
    width: 54px;
    height: 54px;
    border-radius: 16px;
  }

  .brand-title {
    font-size: 28px;
  }

  .brand-subtitle {
    font-size: 10px;
  }

  .gold-button.compact {
    min-height: 44px;
    padding: 0 14px;
    font-size: 12px;
  }

  .hero-title {
    font-size: clamp(58px, 16vw, 88px);
  }

  .hero-platforms {
    font-size: 24px;
    line-height: 1.1;
  }

  .hero-description {
    font-size: 20px;
    line-height: 1.3;
  }

  .hero-cards {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .hero-card-wrap {
    padding-top: 0;
  }

  .hero-orbit {
    display: none;
  }

  .hero-card {
    min-height: 260px;
    border-radius: 28px;
  }

  .hero-card-icon-shell {
    width: 92px;
    height: 92px;
    border-radius: 26px;
    margin: 10px auto 16px;
  }

  .hero-card-icon {
    width: 48px;
    height: 48px;
  }

  .hero-card-title {
    font-size: 26px;
  }

  .hero-card-pedestal {
    display: none;
  }

  .tabs-row {
    grid-template-columns: 1fr;
  }

  .tab {
    border-radius: 22px;
  }

  .lesson-panel {
    border-radius: 28px;
  }

  .lesson-panel-content {
    padding: 22px;
  }

  .lesson-bullets {
    grid-template-columns: 1fr;
  }

  .lesson-preview-area {
    min-height: 380px;
  }

  .lesson-phone {
    width: 252px;
    min-height: 390px;
  }

  .info-grid,
  .package-grid,
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .content-panel {
    padding: 22px;
    border-radius: 28px;
  }

  .content-section {
    padding-top: 18px;
  }

  .hero-actions,
  .lesson-actions {
    flex-direction: column;
  }

  .gold-button,
  .dark-button {
    width: 100%;
  }
}

@media (max-width: 520px) {
  .brand-title {
    font-size: 24px;
  }

  .brand-subtitle {
    letter-spacing: 0.18em;
  }

  .hero-badges {
    display: grid;
    grid-template-columns: 1fr;
  }

  .hero-badge {
    width: 100%;
  }

  .modal-card {
    padding: 22px;
    border-radius: 28px;
  }
}
