import pytest
from pydantic import ValidationError
from hermes_atlas.schema.canvas import Canvas
from hermes_atlas.catalog import detail


@pytest.mark.parametrize('kind,values', [
    ('kanban',{'select':'missing'}), ('budget_planner',{'prints':'-1'}),
    ('decision_tree',{'path':'start,photo,sound'}), ('map',{'zoom':'3'}),
    ('gallery',{'photo':'2'}), ('product',{'variant':'missing'}),
    ('audio',{'remote':'allow'}), ('places',{'query':'x'*161})
])
def test_invalid_saved_interaction(kind,values):
    block=detail(kind)['example']
    with pytest.raises(ValidationError):
        Canvas.model_validate({'id':'test','title':'Demo','blocks':[block],'state':{block['id']:{'values':values}}})


def test_decision_cycle_is_rejected():
    b={'type':'decision_tree','id':'tree','title':'Demo','start':'a','nodes':[
        {'id':'a','label':'A','choices':[{'label':'B','target':'b'}]},
        {'id':'b','label':'B','choices':[{'label':'A','target':'a'}]}]}
    with pytest.raises(ValidationError):
        Canvas.model_validate({'id':'demo','title':'Tree','blocks':[b]})
