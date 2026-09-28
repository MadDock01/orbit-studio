/**
 * @author Scott Lewis <scott@atomiclotus.net>
 * @copyright 2018 Scott Lewis
 * @version 1.0.0
 * @url http://github.com/iconifyit
 * @url https://atomiclotus.net
 *
 * ABOUT:
 *
 *    This script is a very basic boilerplate for Adobe CEP extensions.
 *
 * NO WARRANTIES:
 *
 *   You are free to use, modify, and distribute this script as you see fit.
 *   No credit is required but would be greatly appreciated.
 *
 *   THIS SCRIPT IS OFFERED AS-IS WITHOUT ANY WARRANTY OR GUARANTEES OF ANY KIND.
 *   YOU USE THIS SCRIPT COMPLETELY AT YOUR OWN RISK AND UNDER NO CIRCUMSTANCES WILL
 *   THE DEVELOPER AND/OR DISTRIBUTOR OF THIS SCRIPT BE HELD LIABLE FOR DAMAGES OF
 *   ANY KIND INCLUDING LOSS OF DATA OR DAMAGE TO HARDWARE OR SOFTWARE. IF YOU DO
 *   NOT AGREE TO THESE TERMS, DO NOT USE THIS SCRIPT.
 */

window.Client = window.Client || {};

$(function() {

    var csInterface = new CSInterface();

    // Ugly workaround to keep track of "checked" and "enabled" statuses
   // var checkableMenuItem_isChecked = true;
   // var targetMenuItem_isEnabled    = true;

    /**
     * Eval a script to run in the JSX host app.
     * @param theScript
     */
    Client.eval = function(theScript) {
        csInterface.evalScript(theScript);
    };


   /* $("#checker").click(function () {
        checker();
        csInterface.evalScript('ALRTE("'+documentsPath+'")');
    });

    */

    $('#checker2').on('click',function(){
        csInterface.evalScript('debug("'+XXX+'")');
                
    });


             $('#test8').on('click',function(){
                PDFCB = "'" + PDFCB + "'";
                
                csInterface.evalScript('ALRT("'+XXX+'","'+PDFCB+'")');
                
             });
      
      
            });
















