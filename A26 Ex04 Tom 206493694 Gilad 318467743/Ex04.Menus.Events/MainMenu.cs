using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Ex04.Menus.Events
{
	public class MainMenu : MenuItem
	{
		List<MenuItem> m_MenuItems;
		public MainMenu(string i_Title) : base(i_Title)
		{
			m_MenuItems = new List<MenuItem>();
		}

		public void AddMenuItem(MenuItem item)
		{
			m_MenuItems.Add(item);
		}

        public override void Execute()
        {
            bool userWantsToQuit = false;

			while (!userWantsToQuit)
			{
				Console.Clear();
				Console.ForegroundColor = ConsoleColor.DarkMagenta;
				Console.WriteLine(Title);
				Console.ResetColor();
				for (int i = 0; i < m_MenuItems.Count; i++)
				{
					Console.WriteLine($"{i + 1}. {m_MenuItems[i].Title}");
				}

				Console.WriteLine("0. Back/Exit");
				Console.WriteLine($"Please enter your choice (1-{m_MenuItems.Count} or 0 to exit):");
				if (int.TryParse(Console.ReadLine(), out int userInput) && userInput >= 0 && userInput <= m_MenuItems.Count) 
				{
					if (userInput == 0)
					{
						userWantsToQuit |= true;
					}
					else 
					{
						m_MenuItems[userInput - 1].Execute();
					}
				}
				else
				{
					Console.WriteLine("Invalid input. Please try again");
				}
			}
        }
	}
}
