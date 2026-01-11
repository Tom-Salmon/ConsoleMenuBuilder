# Console Menu Builder

A C# library demonstrating two approaches to building console-based menu systems using the Observer design pattern.

## Authors

- **Tom Salmon** - 206493694
- **Gilad Raskind** - 318467743

## Project Structure

| Project | Target Framework | Description |
|---------|------------------|-------------|
| `Ex04.Menus.Interfaces` | .NET Framework 4.7.2 | Menu system using interface-based Observer pattern |
| `Ex04.Menus.Events` | .NET Framework 4.7.2 | Menu system using event-based Observer pattern |
| `Ex04.Menus.Test` | .NET 8 | Test application demonstrating both implementations |

## Architecture

### Interface-Based Approach (`Ex04.Menus.Interfaces`)

Uses the `ISelectedObserver` interface to notify listeners when a menu item is selected.

```csharp
public interface ISelectedObserver
{
    void OnSelected();
}
```

**Usage:**
```csharp
ActionItem menuItem = new ActionItem("Show Date");
menuItem.AddListener(new ShowDateObserver());
```

### Event-Based Approach (`Ex04.Menus.Events`)

Uses C# events and delegates to notify subscribers when a menu item is selected.

```csharp
public event Action Selected;
```

**Usage:**
```csharp
ActionItem menuItem = new ActionItem("Show Date");
menuItem.Selected += () => Console.WriteLine(DateTime.Now.ToString("dd/MM/yyyy"));
```

## Class Hierarchy

```
MenuItem (abstract)
??? MainMenu      - Container for sub-menu items with navigation
??? ActionItem    - Executable menu item that triggers observers/events
```

## Features

- Hierarchical menu navigation
- Customizable exit/back text
- Clear screen on menu transitions
- Input validation for menu selections
- Support for multiple observers per action item

## Getting Started

### Prerequisites

- Visual Studio 2022 or later
- .NET Framework 4.7.2
- .NET 8 SDK

### Running the Application

1. Clone the repository
2. Open the solution in Visual Studio
3. Set `Ex04.Menus.Test` as the startup project
4. Press F5 to run

## Example

```csharp
// Create main menu
MainMenu mainMenu = new MainMenu("Main Menu");
mainMenu.ExitWord = "Exit";

// Create sub-menu
MainMenu subMenu = new MainMenu("Options");
ActionItem action = new ActionItem("Say Hello");

// Build menu structure
mainMenu.AddMenuItem(subMenu);
subMenu.AddMenuItem(action);

// Add observer (Interfaces version)
action.AddListener(new HelloObserver());

// Execute menu
mainMenu.Execute();
```

## License

This project is for educational purposes as part of a C#/.NET course assignment.
