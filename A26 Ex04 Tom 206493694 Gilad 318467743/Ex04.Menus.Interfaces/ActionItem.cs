using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Ex04.Menus.Interfaces
{
    public class ActionItem : MenuItem
    {
        private readonly List<ISelectedObserver> m_Listeners;

        public ActionItem(string i_Title) : base(i_Title)
        {
            m_Listeners = new List<ISelectedObserver>();
        }

        public override void Execute()
        {
            Console.Clear();
            foreach (ISelectedObserver listener in m_Listeners)
            {
                listener.OnSelected();
            }
            Console.WriteLine("Press any key to continue...");
            Console.ReadKey();
        }

        public void AddListener(ISelectedObserver i_Listener)
        {
            m_Listeners.Add(i_Listener);
        }
    }
}