using System.Text;
using Interfaces = Ex04.Menus.Interfaces;
using Events = Ex04.Menus.Events;
using Ex04.Menus.Events;

namespace Ex04.Menus.Test
{
    public class Program
    {
        public static void Main()
        {
            MenuBuilder menuBuilder = new MenuBuilder();
            Interfaces.MenuItem interfacesMenu = menuBuilder.CreateInterfacesMenu();
            Events.MenuItem eventsMenu = menuBuilder.CreateEventsMenu();

            interfacesMenu.Execute();
            eventsMenu.Execute();
        }
    }
}