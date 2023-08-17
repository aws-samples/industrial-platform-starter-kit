FROM public.ecr.aws/lambda/python:3.11
RUN yum -y update
COPY ./requirements.txt ./
RUN python3 -m pip install -r requirements.txt -t .
COPY . .
CMD ["index.handler"]
