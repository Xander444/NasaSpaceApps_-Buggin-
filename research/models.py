from __future__ import annotations

from typing import Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field

class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_max_length=1200, allow_inf_nan=False)

class Condition(Strict):
    field: Literal['material','fuel_class','gravity','oxygen_initial_percent','pressure','airflow','direction','geometry','sensor']
    mode: Literal['required','preferred']
    operator: Literal['eq','neq','contains','lt','lte','gt','gte','range']
    value: Union[str, float]
    unit: str = ''
    max: Optional[Union[str, float]] = None
    tolerance: Optional[Union[str, float]] = None
    id: Optional[str] = None

class Controls(Strict):
    conditions: list[Condition] = Field(default_factory=list, max_length=12)
    program: str = Field(default='', max_length=100)
    familyName: str = Field(default='', max_length=100)
    problem: Literal['','prevention','detection','suppression'] = ''
    outcome: Literal['','flame spread','ignition','extinction','detector response'] = ''
    needed: Literal['','measurements','images/video','methods','findings'] = ''
    sort: Literal['relevance','name','publication_date'] = 'relevance'

class Answer(Strict):
    question: str = Field(max_length=250)
    answer: str = Field(max_length=400)

class Question(Strict):
    question: str = Field(max_length=250)
    why: str = Field(max_length=250)
    options: list[str] = Field(max_length=4)

class Proposal(Strict):
    condition: Condition
    user_span: str = Field(max_length=250)

class Intent(Strict):
    goal: str = Field(max_length=400)
    environment: Optional[str] = Field(default=None, max_length=200)
    desired_data: Optional[str] = Field(default=None, max_length=200)
    unknowns: list[str] = Field(default_factory=list, max_length=6)

class Analysis(Strict):
    status: Literal['ready','needs_clarification']
    interpretation: Intent
    proposed_conditions: list[Proposal] = Field(default_factory=list,max_length=8)
    questions: list[Question] = Field(default_factory=list,max_length=2)
    remaining_ambiguity: list[str] = Field(default_factory=list,max_length=6)

class Request(Strict):
    prompt: str = Field(min_length=1,max_length=800)
    answers: list[Answer] = Field(default_factory=list,max_length=4)
    controls: Controls = Field(default_factory=Controls)
    context: str = Field(default='',max_length=3000)
    index_version: str = Field(max_length=64)
    summary_version: str = Field(max_length=64)
    search_now: bool = False
    rounds: int = Field(default=0,ge=0,le=2)

class RecommendRequest(Request):
    intent: Intent

class Rank(Strict):
    excerpt_truncated: bool = False
    id: str = Field(max_length=30)
    source_id: str = Field(max_length=100)
    excerpt: str = Field(min_length=1,max_length=400)

class Ranking(Strict):
    ranked: list[Rank] = Field(max_length=24)
