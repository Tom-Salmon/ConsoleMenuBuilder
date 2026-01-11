using Ex04.Menus.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Ex04.Menus.Test
{
    internal class CountLowercase : ISelectedObserver
    {
        public void OnSelected()
        {
            Console.WriteLine("Please enter a sentence:");
            string input = Console.ReadLine();
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
