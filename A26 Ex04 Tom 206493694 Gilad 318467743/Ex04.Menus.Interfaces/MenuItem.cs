using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Ex04.Menus.Interfaces
{
    public abstract class MenuItem
    {
        private string m_Title;
        public string Title
        {
            get
            {
                return m_Title;
            }
        }

        public abstract void Execute();

        public MenuItem(string i_Title)
        {
            m_Title = i_Title;
        }
    }
}