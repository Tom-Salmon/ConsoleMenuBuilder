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

**Observer implementations in Test project:**
- `ShowDate` - Displays current date
- `ShowTime` - Displays current time
- `ShowVersion` - Displays app version
- `CountLowercase` - Counts lowercase letters in user input

**Usage:**
```csharp
ActionItem menuItem = new ActionItem("Show Date");
menuItem.AddListener(new ShowDate());
```

### Event-Based Approach (`Ex04.Menus.Events`)

Uses C# events and delegates to notify subscribers when a menu item is selected.

```csharp
public event Action Selected;
```

**Event handlers are organized in the `EventsActions` class:**
- `ShowDate_Selected()` - Displays current date
- `ShowTime_Selected()` - Displays current time
- `ShowVersion_Selected()` - Displays app version
- `CountLowercase_Selected()` - Counts lowercase letters in user input

**Usage:**
```csharp
EventsActions eventsActions = new EventsActions();
ActionItem menuItem = new ActionItem("Show Date");
menuItem.Selected += new Action(eventsActions.ShowDate_Selected);
```

## Class Hierarchy

### Menu Libraries
```
MenuItem (abstract)
??? MainMenu      - Container for sub-menu items with navigation
??? ActionItem    - Executable menu item that triggers observers/events
```

### Test Project
```
Program           - Entry point
MenuBuilder       - Factory class that creates both menu implementations
EventsActions     - Contains event handler methods for Events-based menu
ISelectedObserver implementations:
??? ShowDate
??? ShowTime
??? ShowVersion
??? CountLowercase
```

## Features

- Hierarchical menu navigation
- Customizable exit/back text
- Clear screen on menu transitions
- Input validation for menu selections and user input
- Support for multiple observers per action item
- Centralized menu creation via `MenuBuilder` class

## Demo Menu Structure

```
Main Menu
??? Version and Lowercase
?   ??? Show Version
?   ??? Count Lowercase
??? Show Current Date/Time
    ??? Show Date
    ??? Show Time
```

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
// Using MenuBuilder to create menus
MenuBuilder menuBuilder = new MenuBuilder();
Interfaces.MenuItem interfacesMenu = menuBuilder.CreateInterfacesMenu();
Events.MenuItem eventsMenu = menuBuilder.CreateEventsMenu();

// Execute menus sequentially
interfacesMenu.Execute();
eventsMenu.Execute();
```

### Creating a Custom Menu (Interfaces approach)

```csharp
// Create menu structure
Interfaces.MainMenu mainMenu = new Interfaces.MainMenu("My Menu");
Interfaces.ActionItem action = new Interfaces.ActionItem("Say Hello");

mainMenu.ExitWord = "Exit";
mainMenu.AddMenuItem(action);

// Add observer
action.AddListener(new MyCustomObserver());

// Run menu
mainMenu.Execute();
```

### Creating a Custom Menu (Events approach)

```csharp
// Create menu structure
Events.MainMenu mainMenu = new Events.MainMenu("My Menu");
Events.ActionItem action = new Events.ActionItem("Say Hello");

mainMenu.ExitWord = "Exit";
mainMenu.AddMenuItem(action);

// Subscribe to event
action.Selected += () => Console.WriteLine("Hello!");

// Run menu
mainMenu.Execute();
```

## License

This project is for educational purposes as part of a C#/.NET course assignment.
