using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Ex04.Menus.Test
{
    public class EventsActions
    {
        public void ShowDate_Selected()
        {
            Console.WriteLine(DateTime.Now.ToString("dd/MM/yyyy"));
        }
        public void ShowTime_Selected()
        {
            Console.WriteLine(DateTime.Now.ToString("HH:mm:ss"));
        }
        public void ShowVersion_Selected()
        {
            Console.WriteLine("App Version: 26.1.4.5940");
        }
        public void CountLowercase_Selected()
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
