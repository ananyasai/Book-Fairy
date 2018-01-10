
$(document).ready ( function(){


var code = getURLParameter('ref');
var save = getURLParameter('save');

$('input[name=param]').val(code);

if (save != "null"){
   $('p').show();
 } else {
    $('p').hide(); 
 }

var snapshot = $.ajax({
    url: "https://us-central1-book-fairy.cloudfunctions.net/UserBookData?text="+code,
    contentType: "application/json; charset=utf-8",
    dataType:"json",
    async: false
    }).responseText;

//var snapshot = JSON.stringify(example);
console.log(snapshot);

//var example = [{"Read":true,"category":"fables","enabled":true,"storyName":"Androcles_Fable"},{"Read":false,"category":"fables","enabled":true,"storyName":"Belling_the_cat_Fable"}];

//var users = JSON.parse(snapshot).users;
var storiesData = JSON.parse(snapshot)
var stories = Object.keys(storiesData).map(e => storiesData[e])

for (i = 0; i < stories.length; i++) { 
    var newdiv = document.createElement('div');
    if (stories[i].Read){
    newdiv.innerHTML = "<label><input type='checkbox' checked='checked' name="+stories[i].id+" /> "+stories[i].storyName+" </label>";
    //newdiv.innerHTML = "<div class='ui-checkbox'><label for='"+newSnapshot[i].storyName+"' class='ui-btn ui-corner-all ui-btn-inherit ui-btn-icon-left ui-checkbox-off'>"+newSnapshot[i].storyName+"</label><input type='checkbox' name='"+newSnapshot[i].storyName+"' id='"+newSnapshot[i].storyName+"' data-enhanced='true'></div>"
    } else {
    newdiv.innerHTML = "<label><input type='checkbox' name="+stories[i].id+" /> "+stories[i].storyName+" </label>";        
    }

    $(newdiv).appendTo("#list").enhanceWithin();
}

})
$(window).resize(function(){
//$("#example-table").tabulator("redraw");

//$('list').innerHTML(myHtmlStr).enhanceWithin();


});
$(window).click(function(e) {

    if (e.target.type == "checkbox"){
        $('p').hide(); 
    }
    
});
function getUrlVars(){
    var vars = [], hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for(var i = 0; i < hashes.length; i++)
    {
        hash = hashes[i].split('=');
        vars.push(hash[0]);
        vars[hash[0]] = hash[1];
    }
    return vars;
} 

function getURLParameter(name) {
return decodeURI(
    (RegExp(name + '=' + '(.+?)(&|$)').exec(location.search)||[,null])[1]
    );
}