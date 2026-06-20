# Editor Toolbar Specification

## ADDED Requirements

### Requirement: Bubble Menu Icons Match Their Actions

The editor bubble menu SHALL use icons that visually correspond to the action they invoke.

#### Scenario: Text formatting controls

- **GIVEN** the bubble menu is shown for selected text
- **WHEN** the user scans the controls
- **THEN** font, size, heading, color, bold, italic, strike, link, alignment, and AI controls SHALL use semantically recognizable icons

### Requirement: Bubble Menu Behavior Is Preserved

Replacing icons SHALL NOT change existing editor command behavior.

#### Scenario: Existing command behavior

- **GIVEN** a user clicks a bubble menu button
- **WHEN** the icon has been replaced
- **THEN** the original command SHALL still execute
- **AND** active styling and tooltips SHALL still work

