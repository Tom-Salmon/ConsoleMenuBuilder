using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading.Tasks;

namespace Ex04.Menus.Events
{
    public class ActionItem : MenuItem
    {
        public event Action Selected;

		public ActionItem(string i_Title) : base(i_Title)
		{
		}

		protected virtual void OnSelected()
        {
            if (Selected != null)
            {
                Selected.Invoke();
            }
        }

        public override void Execute()
        {
            Console.Clear();
            OnSelected();
            Console.WriteLine("Press any key to continue...");
            Console.ReadKey();
        }

    }
}
