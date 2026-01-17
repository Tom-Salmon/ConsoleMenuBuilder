using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Ex04.Menus.Test
{
    public class MenuBuilder
    {
        public Interfaces.MenuItem CreateInterfacesMenu()
        {
            Interfaces.MainMenu mainMenu = new Interfaces.MainMenu("Interfaces Main Menu");
            Interfaces.MainMenu versionAndLowercase = new Interfaces.MainMenu("Version and Lowercase");
            Interfaces.ActionItem showVersion = new Interfaces.ActionItem("Show Version");
            Interfaces.ActionItem countLowercase = new Interfaces.ActionItem("Count Lowercase");
            Interfaces.MainMenu showDateOrTime = new Interfaces.MainMenu("Show Current Date/Time");
            Interfaces.ActionItem showDate = new Interfaces.ActionItem("Show Date");
            Interfaces.ActionItem showTime = new Interfaces.ActionItem("Show Time");

            mainMenu.ExitWord = "Exit";
            mainMenu.AddMenuItem(versionAndLowercase);
            mainMenu.AddMenuItem(showDateOrTime);
            versionAndLowercase.AddMenuItem(showVersion);
            versionAndLowercase.AddMenuItem(countLowercase);
            showDateOrTime.AddMenuItem(showDate);
            showDateOrTime.AddMenuItem(showTime);
            showDate.AddListener(new ShowDate());
            showTime.AddListener(new ShowTime());
            showVersion.AddListener(new ShowVersion());
            countLowercase.AddListener(new CountLowercase());

            return mainMenu;
        }

        public Events.MenuItem CreateEventsMenu()
        {
            EventsActions eventsActions = new EventsActions();
            Events.MainMenu mainMenu = new Events.MainMenu("Events Main Menu");
            Events.MainMenu versionAndLowercase = new Events.MainMenu("Version and Lowercase");
            Events.ActionItem showVersion = new Events.ActionItem("Show Version");
            Events.ActionItem countLowercase = new Events.ActionItem("Count Lowercase");
            Events.MainMenu showDateOrTime = new Events.MainMenu("Show Current Date/Time");
            Events.ActionItem showDate = new Events.ActionItem("Show Date");
            Events.ActionItem showTime = new Events.ActionItem("Show Time");

            mainMenu.ExitWord = "Exit";
            mainMenu.AddMenuItem(versionAndLowercase);
            mainMenu.AddMenuItem(showDateOrTime);
            versionAndLowercase.AddMenuItem(showVersion);
            versionAndLowercase.AddMenuItem(countLowercase);
            showDateOrTime.AddMenuItem(showDate);
            showDateOrTime.AddMenuItem(showTime);
            showDate.Selected += new Action(eventsActions.ShowDate_Selected);
            showTime.Selected += new Action(eventsActions.ShowTime_Selected);
            showVersion.Selected += new Action(eventsActions.ShowVersion_Selected);
            countLowercase.Selected += new Action(eventsActions.CountLowercase_Selected);

            return mainMenu;
        }
    }
}
