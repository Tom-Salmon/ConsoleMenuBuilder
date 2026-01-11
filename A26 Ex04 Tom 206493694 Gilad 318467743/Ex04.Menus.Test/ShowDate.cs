using Ex04.Menus.Interfaces;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Ex04.Menus.Test
{
    internal class ShowDate : ISelectedObserver
    {
        public void OnSelected()
        {
            Console.WriteLine(DateTime.Now.ToString("dd/MM/yyyy"));
        }
    }
}
