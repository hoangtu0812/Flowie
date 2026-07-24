---
name: Luminous Professional
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#5c5f61'
  on-secondary: '#ffffff'
  secondary-container: '#e0e3e5'
  on-secondary-container: '#626567'
  tertiary: '#943700'
  on-tertiary: '#ffffff'
  tertiary-container: '#bc4800'
  on-tertiary-container: '#ffede6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#e0e3e5'
  secondary-fixed-dim: '#c4c7c9'
  on-secondary-fixed: '#191c1e'
  on-secondary-fixed-variant: '#444749'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7d2d00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

This design system is built on a foundation of **Corporate Modernism** with an emphasis on clarity and precision. It prioritizes high-utility productivity environments by utilizing an "airy" layout with ample whitespace to reduce cognitive load. 

The aesthetic is characterized by a refined professional tone that feels both reliable and forward-thinking. Visual hierarchy is achieved through subtle structural elements—thin borders and soft elevation—rather than heavy blocks of color. The result is a clean, systematic interface that facilitates focus and long-form task management.

## Colors

The palette centers on a refined "Electric Cobalt" primary blue, optimized for high visibility against clean white surfaces.

- **Primary:** A vibrant blue used for active states, primary actions, and key indicators.
- **Secondary/Surface:** Off-whites and very light grays are used to differentiate the background canvas from interactive containers.
- **Neutrals:** A sophisticated range of slate grays provides high-contrast legibility for typography while remaining softer than pure black.
- **Semantic Colors:** Softened pastels are used for status chips (e.g., lavender for "In Work", amber for "On Review") to maintain the airy feel without visual clutter.

## Typography

The typography system utilizes **Inter** exclusively to leverage its exceptional legibility in data-dense interfaces.

- **Scale:** A tight scale ensures that even at smaller sizes, information remains readable.
- **Hierarchy:** Weight is the primary driver of hierarchy. Headlines use Semi-Bold (`600`) to stand out against a canvas of Regular (`400`) body text.
- **Spacing:** Letter spacing is tightened slightly for headlines to create a more "designed" feel, while labels utilize increased tracking and medium weights for immediate recognition at small scales.

## Layout & Spacing

The layout follows a **Fluid Grid** model with high-density vertical rhythm.

- **Sidebar:** A fixed-width navigation rail (240px) provides consistent access to main categories.
- **Content Area:** A fluid container that expands with the viewport, utilizing a 12-column grid for internal dashboard components.
- **Rhythm:** An 8px base unit governs all dimensions. Elements like task rows use generous horizontal padding (16px) but maintain a compact vertical height to allow more data visibility.
- **Responsive:** On mobile, margins reduce to 16px and the sidebar collapses into a bottom sheet or drawer.

## Elevation & Depth

This design system avoids heavy shadows in favor of **Low-Contrast Outlines** and extremely subtle **Ambient Shadows**.

- **Level 0 (Base):** The main background (`#F9FAFB`).
- **Level 1 (Cards/Rows):** White background with a 1px border (`#E2E8F0`). No shadow is used here to maintain the "airy" feel.
- **Level 2 (Popovers/Dropdowns):** White background with a soft, diffused shadow: `0 4px 12px rgba(0, 0, 0, 0.05)`.
- **Level 3 (Modals):** High-diffusion shadow: `0 20px 25px -5px rgba(0, 0, 0, 0.1)`.

Depth is primarily signaled through the "Layering" of white surfaces over light gray canvases.

## Shapes

The shape language is **Rounded (8px)**, striking a balance between the clinical feel of sharp corners and the overly casual nature of pill shapes.

- **Primary Components:** Buttons, input fields, and task cards use a standard 8px radius.
- **Small Components:** Chips and checkboxes use a 4px radius.
- **Avatars:** Always perfectly circular (pill-shaped) to provide a organic counterpoint to the geometric grid.

## Components

### Buttons
- **Primary:** Solid primary blue with white text. 8px corner radius.
- **Secondary/Ghost:** Thin 1px border with primary color text or neutral text. Backgrounds are transparent until hover.
- **Icon Buttons:** Use a subtle gray hover state. Icons must be 1.5pt stroke weight for a "thin" aesthetic.

### Cards & Rows
- **Task Rows:** 1px border on all sides. On hover, the border color darkens slightly or a very faint shadow is applied to indicate interactivity.
- **Section Headers:** Use a light background tint (`#F8FAFC`) to group related items.

### Input Fields
- Flat design with a 1px border. Focus states use a primary blue border with a 2px "halo" (outer glow) at 10% opacity.

### Chips & Badges
- Low-saturation background colors with high-saturation text. Rounded 4px or 6px depending on scale.

### Icons
- **Style:** Linear, 24x24px bounding box, 1.5px - 2px stroke width. Never filled unless indicating an active toggle state.