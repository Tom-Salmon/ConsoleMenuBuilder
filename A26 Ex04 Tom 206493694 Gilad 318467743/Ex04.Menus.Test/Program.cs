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
            Interfaces.MenuItem interfacesMenu = createInterfacesMenu();
            Events.MenuItem eventsMenu = createEventsMenu();

            interfacesMenu.Execute();
            eventsMenu.Execute();
        }

        public static Interfaces.MenuItem createInterfacesMenu()
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

        public static Events.MenuItem createEventsMenu()
        {
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
            showDate.Selected += new Action(showDate_Selected);
            showTime.Selected += new Action(showTime_Selected);
            showVersion.Selected += new Action(showVersion_Selected);
            countLowercase.Selected += new Action(countLowercase_Selected);

            return mainMenu;
        }

        private static void showDate_Selected()
        {
            Console.WriteLine(DateTime.Now.ToString("dd/MM/yyyy"));
        }
        private static void showTime_Selected()
        {
            Console.WriteLine(DateTime.Now.ToString("HH:mm:ss"));
        }
        private static void showVersion_Selected()
        {
            Console.WriteLine("App Version: 26.1.4.5940");
        }
        private static void countLowercase_Selected()
        {
            string input;
            Console.WriteLine("Please enter a sentence:");
            
            do
            {
                input = Console.ReadLine();
                if (string.IsNullOrEmpty(input))
                {
                    Console.WriteLine("Input cannot be empty. Please try again:");
                }
            }
            while (string.IsNullOrEmpty(input));

            int lowercaseCount = 0;
            foreach (char letter in input)
            {
                if (char.IsLower(letter))
                {
                    lowercaseCount++;
                }
            }

            Console.WriteLine($"The number of lowercase letters in the string is: {lowercaseCount}");
        }
    }
}