using Ex04.Menus.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Ex04.Menus.Test
{
    internal class ShowVersion : ISelectedObserver
    {
        public void OnSelected()
        {
            Console.WriteLine("App Version: 26.1.4.5940");
        }
    }
}
